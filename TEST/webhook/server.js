import express from "express";
import Stripe from "stripe";

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

  // GAS HtmlService may return the payload with JavaScript escapes and/or
  // HTML entities. Normalize both forms before evaluating the ROUTE result.
  const decoded = text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    // Apps Script HtmlService can escape quotes through multiple layers.
    // Remove only backslashes that directly precede a quote; other
    // backslashes remain untouched.
    .replace(/\\+(?=["'])/g, "")
    .replace(/&quot;|&#34;|&#x22;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  // HtmlService can preserve the JSON as an object literal rather than a
  // quoted JSON string, so accept both quoted-key and object-literal forms.
  const ok =
    /["']?ok["']?\s*:\s*true\b/.test(decoded);

  if (!ok) {
    const match =
      decoded.match(/["']?message["']?\s*:\s*["']([^"'<>]*)["']/);
    const reason = match ? match[1] : "unknown GAS error";
    throw new Error("GAS confirmCheckout failed: " + reason);
  }

  return decoded;
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

  const allowed = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded"
  ]);

  if (!allowed.has(event.type)) {
    return res.status(200).json({received:true, ignored:true});
  }

  const session = event.data.object;
  const sessionId = session?.id || "";
  const metadata = session?.metadata || {};
  const ticketCode = String(metadata.ticket_code || "").trim();
  const lineUserId = String(
    metadata.line_user_id ||
    session?.client_reference_id ||
    ""
  ).trim();

  // Ignore Checkout Sessions that are not ROUTE Q&A purchases.
  // This Stripe account may also contain unrelated Payment Links.
  if (!["ticket3", "ticket10"].includes(ticketCode) || !lineUserId) {
    console.log(JSON.stringify({
      kind:"stripe_event_ignored_non_route",
      eventId:event.id,
      type:event.type,
      sessionId
    }));

    return res.status(200).json({
      received:true,
      verified:true,
      ignored:true,
      reason:"not_route_qa"
    });
  }

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

async function runGasIdempotencySelfTest() {
  const sessionId = String(process.env.SELFTEST_SESSION_ID || "").trim();
  if (!sessionId) return;

  try {
    const first = await confirmCheckoutInGas(sessionId, "selftest-1");
    const second = await confirmCheckoutInGas(sessionId, "selftest-2");

    const firstAlready = first.includes('"alreadyGranted":true');
    const secondAlready = second.includes('"alreadyGranted":true');
    const firstGrantedFalse = first.includes('"granted":false');
    const secondGrantedFalse = second.includes('"granted":false');

    console.log(JSON.stringify({
      kind:"gas_idempotency_selftest",
      pass:firstAlready && secondAlready && firstGrantedFalse && secondGrantedFalse,
      firstAlready,
      secondAlready,
      firstGrantedFalse,
      secondGrantedFalse
    }));
  } catch (error) {
    console.error(JSON.stringify({
      kind:"gas_idempotency_selftest",
      pass:false,
      message:error?.message || String(error)
    }));
  }
}

app.listen(port, () => {
  console.log("listening", port);
  runGasIdempotencySelfTest();
});
