import express from "express";
import Stripe from "stripe";
// TEST-only service. Never import the LIVE fulfillment guard on this branch.
import { verifyGasConfirmationResponse } from "./gas-confirmation.mjs";

const app = express();
const port = process.env.PORT || 10000;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const TEST_SHEET_ID = "1EdVYzWiiCaqX_3EFrnt6Qw2_XdwIgCtKaMEvogmMwD0";
const LIVE_DEPLOYMENT_ID = "AKfycbyAUKGZK_WK8l_bGs0AEWilwP_Z8WKRaeSsX3iP1dijuReeMAF-rVBIZl-CQYcozDCu3A";
const gasWebAppUrl = process.env.ROUTEQ_TEST_GAS_WEB_APP_URL || "";
const isolatedMode = process.env.ROUTEQ_TEST_ISOLATION_APPROVED === "YES" &&
  process.env.ROUTEQ_TEST_SHEET_ID === TEST_SHEET_ID &&
  (process.env.ROUTEQ_TEST_INTERNAL_SECRET || "").length >= 32 &&
  /^sk_test_/.test(process.env.STRIPE_SECRET_KEY || "") &&
  /^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || "") &&
  /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gasWebAppUrl) &&
  !gasWebAppUrl.includes(LIVE_DEPLOYMENT_ID);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

app.get("/health", (req,res) =>
  res.status(200).json({
    ok:true,
    service:"routeq-payment-isolated-test",
    isolationEnabled:isolatedMode
  })
);

async function confirmCheckoutInGas(sessionId, eventId) {
  if (!isolatedMode) throw new Error("isolated_test_not_approved");

  const body = new URLSearchParams({
    action:"confirmCheckout",
    sessionId:String(sessionId || ""),
    requestId:"stripe-webhook-" + String(eventId || ""),
    testSecret: String(process.env.ROUTEQ_TEST_INTERNAL_SECRET || "")
  });

  const response = await fetch(gasWebAppUrl, {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},
    body,
    redirect:"follow",
    signal:AbortSignal.timeout(20000)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error("GAS HTTP " + response.status);
  }

  // A 200 status from GAS alone is not proof of paid + granted state.
  // Reject malformed HTML, mismatched request IDs and ambiguous grants so
  // Stripe can safely retry rather than silently losing a paid order.
  return verifyGasConfirmationResponse(text, eventId);

}

app.post("/stripe/webhook", express.raw({type:"application/json"}), async (req,res) => {
  if (!isolatedMode) return res.status(503).send("isolated_test_disabled");

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      webhookSecret
    );
  } catch (e) {
    console.warn(JSON.stringify({
      kind:"stripe_webhook_rejected",
      reason:"invalid_signature"
    }));
    return res.status(400).send("invalid signature");
  }

  // Strict TEST-only gate. No LIVE event, account or payment can be fulfilled.
  const session = event?.data?.object;
  if (event.livemode !== false || session?.livemode !== false) {
    return res.status(200).json({received:true,ignored:true,reason:"not_test_event"});
  }
  if (!isolatedMode) return res.status(503).json({received:true,processed:false,reason:"test_isolation_not_approved"});
  const code = String(session?.metadata?.ticket_code || "");
  const count = code === "ticket3" ? 3 : code === "ticket10" ? 10 : null;
  const amount = code === "ticket3" ? 1000 : code === "ticket10" ? 3000 : null;
  const marker = session?.metadata?.routeq_test_marker;
  const valid = new Set(["checkout.session.completed","checkout.session.async_payment_succeeded"]).has(event.type) &&
    session?.object === "checkout.session" &&
    /^cs_test_/.test(String(session?.id || "")) &&
    session?.mode === "payment" && session?.status === "complete" &&
    session?.payment_status === "paid" &&
    session?.currency === "jpy" && session?.amount_total === amount &&
    String(session?.metadata?.grant_count || "") === String(count) &&
    !!String(session?.metadata?.line_user_id || "") &&
    session?.metadata?.line_user_id === session?.client_reference_id &&
    String(session?.payment_intent || "").startsWith("pi_") &&
    marker === "ROUTEQ_PAY0104_ISOLATED_20261018";
  if (!valid) return res.status(200).json({received:true,ignored:true,reason:"not_isolated_qa_test_order"});
  const sessionId = session.id;

  try {
    await confirmCheckoutInGas(sessionId, event.id);

    console.log(JSON.stringify({
      kind:"stripe_event_processed",
      eventId:event.id,
      type:event.type,
      sessionId,
      paymentStatus:session?.payment_status || null
    }));

    return res.status(200).json({
      received:true,
      verified:true,
      processed:true,
      eventId:event.id
    });
  } catch (error) {
    console.error(JSON.stringify({
      kind:"stripe_event_processing_failed",
      eventId:event.id,
      type:event.type,
      sessionId,
      message:error?.message || String(error)
    }));

    // Return a retryable error so Stripe can redeliver the event.
    return res.status(500).json({
      received:true,
      verified:true,
      processed:false
    });
  }
});

app.listen(port, () => {
  console.log("listening", port);
});
