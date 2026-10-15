import express from "express";
import Stripe from "stripe";
import { vetStripeCheckoutForLegacyLive } from "./payment-guard.mjs";
import { verifyGasConfirmationResponse } from "./gas-confirmation.mjs";

const app = express();
const port = process.env.PORT || 10000;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const gasWebAppUrl = process.env.GAS_WEB_APP_URL;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

app.get("/health", (req,res) =>
  res.status(200).json({
    ok:true,
    service:"kikeroute-stripe-webhook",
    gasConfigured:Boolean(gasWebAppUrl),
    webhookSecretConfigured:Boolean(webhookSecret)
  })
);

async function confirmCheckoutInGas(sessionId, eventId) {
  if (!gasWebAppUrl) {
    throw new Error("GAS_WEB_APP_URL is not configured");
  }

  const body = new URLSearchParams({
    action:"confirmCheckout",
    sessionId:String(sessionId || ""),
    requestId:"stripe-webhook-" + String(eventId || "")
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
  if (!webhookSecret) return res.status(503).send("webhook secret not configured");

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

  // Reject TEST or unverified Checkout before any request to operational GAS.
  // Stripe signature verification has already succeeded above.
  const gate = vetStripeCheckoutForLegacyLive(event);
  if (!gate.allowed) {
    console.warn(JSON.stringify({
      kind:"stripe_event_ignored_by_safety_gate",
      eventId:event.id,
      type:event.type,
      reason:gate.reason
    }));
    return res.status(200).json({
      received:true,
      verified:true,
      ignored:true,
      reason:gate.reason
    });
  }

  const session = event.data.object;
  const sessionId = gate.sessionId;

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
