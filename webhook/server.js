import express from "express";
import Stripe from "stripe";
import { fileURLToPath } from "node:url";

const DEFAULT_TICKETS = Object.freeze({
  ticket3: Object.freeze({ amount: 1500, count: 3 }),
  ticket10: Object.freeze({ amount: 3500, count: 10 })
});

const normalizeId = (value) => String(value || "").trim();

export function validateRouteSession(session, tickets = DEFAULT_TICKETS) {
  const metadata = session?.metadata || {};
  const sessionId = normalizeId(session?.id);
  const paymentIntentId = normalizeId(session?.payment_intent);
  const metadataUserId = normalizeId(metadata.line_user_id);
  const referenceUserId = normalizeId(session?.client_reference_id);
  const lineUserId = normalizeId(metadataUserId || referenceUserId);
  const ticketCode = normalizeId(metadata.ticket_code);
  const def = tickets[ticketCode];
  const amount = Number(session?.amount_total);
  const grantCount = Number(metadata.grant_count);
  const currency = normalizeId(session?.currency).toLowerCase();

  if (!sessionId || !paymentIntentId || !lineUserId || !def) {
    return { ok: false, reason: "missing_or_unknown_route_identity" };
  }
  if (metadataUserId && referenceUserId && metadataUserId !== referenceUserId) {
    return { ok: false, reason: "route_user_mismatch" };
  }
  if (session?.payment_status !== "paid") {
    return { ok: false, reason: "payment_not_paid" };
  }
  if (currency !== "jpy" || amount !== def.amount || grantCount !== def.count) {
    return { ok: false, reason: "route_purchase_mismatch" };
  }
  return { ok: true, sessionId, paymentIntentId, lineUserId, ticketCode, amount, grantCount };
}

export function createWebhookApp({
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  gasWebAppUrl = process.env.GAS_WEB_APP_URL,
  qaWebhookEnabled = false,
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"),
  fetchImpl = globalThis.fetch,
  tickets = DEFAULT_TICKETS
} = {}) {
  const app = express();
  const processedEvents = new Set();
  const processedSessions = new Map();
  const processedPaymentIntents = new Map();

  app.get("/health", (req, res) => res.status(200).json({
    ok: true,
    service: "kikeroute-stripe-webhook",
    enabled: qaWebhookEnabled,
    gasConfigured: Boolean(gasWebAppUrl),
    webhookSecretConfigured: Boolean(webhookSecret)
  }));

  async function confirmCheckoutInGas(sessionId, eventId) {
    if (!gasWebAppUrl) throw new Error("GAS_WEB_APP_URL is not configured");
    const body = new URLSearchParams({
      action: "confirmCheckout",
      sessionId: normalizeId(sessionId),
      requestId: "stripe-webhook-" + normalizeId(eventId)
    });
    const response = await fetchImpl(gasWebAppUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      redirect: "follow",
      signal: AbortSignal.timeout(20000)
    });
    const text = await response.text();
    if (!response.ok) throw new Error("GAS HTTP " + response.status);
    const decoded = text
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\+(?=["'])/g, "")
      .replace(/&quot;|&#34;|&#x22;/gi, '"')
      .replace(/&#39;|&#x27;|&apos;/gi, "'")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
    if (!/["']?ok["']?\s*:\s*true\b/.test(decoded)) {
      const match = decoded.match(/["']?message["']?\s*:\s*["']([^"'<>]*)["']/);
      throw new Error("GAS confirmCheckout failed: " + (match ? match[1] : "unknown GAS error"));
    }
    return decoded;
  }

  app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    if (!qaWebhookEnabled) return res.status(503).send("isolated_qa_webhook_disabled");
    if (!webhookSecret) return res.status(503).send("webhook secret not configured");

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], webhookSecret);
    } catch {
      console.warn(JSON.stringify({ kind: "stripe_webhook_rejected", reason: "invalid_signature" }));
      return res.status(400).send("invalid signature");
    }

    const allowed = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
    if (!allowed.has(event.type)) {
      return res.status(200).json({ received: true, verified: true, ignored: true });
    }
    if (processedEvents.has(event.id)) {
      return res.status(200).json({ received: true, verified: true, duplicate: true });
    }

    const checked = validateRouteSession(event.data.object, tickets);
    if (!checked.ok) {
      return res.status(200).json({ received: true, verified: true, ignored: true, reason: checked.reason });
    }
    const sessionOwner = processedSessions.get(checked.sessionId);
    const intentOwner = processedPaymentIntents.get(checked.paymentIntentId);
    if ((sessionOwner && sessionOwner !== event.id) || (intentOwner && intentOwner !== event.id)) {
      return res.status(200).json({
        received: true,
        verified: true,
        duplicate: true,
        reason: sessionOwner ? "duplicate_session" : "duplicate_payment_intent"
      });
    }

    try {
      await confirmCheckoutInGas(checked.sessionId, event.id);
      processedEvents.add(event.id);
      processedSessions.set(checked.sessionId, event.id);
      processedPaymentIntents.set(checked.paymentIntentId, event.id);
      return res.status(200).json({ received: true, verified: true, processed: true, eventId: event.id });
    } catch (error) {
      console.error(JSON.stringify({
        kind: "stripe_event_processing_failed",
        eventId: event.id,
        type: event.type,
        sessionId: checked.sessionId,
        message: error?.message || String(error)
      }));
      return res.status(500).json({ received: true, verified: true, processed: false });
    }
  });

  return app;
}

export const app = createWebhookApp({ qaWebhookEnabled: false });

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = process.env.PORT || 10000;
  app.listen(port, () => console.log("listening", port));
}
