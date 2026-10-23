/**
 * ROUTEQ official 01, isolated TEST-only Stripe gateway.
 * This is a separate service entry point; DO NOT use for the existing PAY-04
 * Render service or production kikeroute-stripe-webhook.
 * OFF by default. No LINE/OpenAI API call or LIVE key is permitted.
 */
import express from "express";
import Stripe from "stripe";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const TEST_ACCOUNT = "acct_1TjYNMIRwv4Jy7lt";
const TEST_USER = "U_ROUTEQ_ISOLATED_MOCK_20261023";
const TEST_MARKER = "ROUTEQ_QA_ISOLATED_STRIPE_TEST_20261023";
const ALLOWED_TYPES = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const TICKETS = Object.freeze({
  ticket3: Object.freeze({amount: 1000, count: 3}),
  ticket10: Object.freeze({amount: 3000, count: 10})
});
const SAFE_GAS_FAILURE_REASONS = new Set([
  "STRIPE_TEST_INGRESS_DISABLED", "STRIPE_TEST_SHARED_SECRET_MISSING",
  "STRIPE_TEST_ENVELOPE_INVALID", "STRIPE_TEST_ENVELOPE_EXPIRED",
  "STRIPE_TEST_ENVELOPE_SIGNATURE_INVALID", "STRIPE_TEST_PACKET_INVALID",
  "STRIPE_TEST_PACKET_IDENTITY_INVALID", "STRIPE_TEST_SESSION_IDENTITY_INVALID",
  "STRIPE_TEST_SESSION_PRODUCT_INVALID", "STRIPE_TEST_FIXTURE_SHEETS_INVALID",
  "STRIPE_TEST_INTENT_CONFLICT", "STRIPE_TEST_EXISTING_PAYMENT_CONFLICT",
  "STRIPE_TEST_GRANT_NOT_CONFIRMED", "STRIPE_TEST_INGRESS_REJECTED"
]);
const SAFE_GATEWAY_FAILURE_STAGES = new Set([
  "gateway_stripe_construct_failed", "gateway_stripe_retrieve_failed",
  "gateway_gas_fetch_failed", "gateway_gas_http_failed",
  "gateway_gas_json_failed", "gateway_gas_validation_failed"
]);
const asString = x => typeof x === "string" ? x.trim() : "";

export function validateIsolatedTestSession(session) {
  if (!session || typeof session !== "object" || session.livemode !== false ||
      session.mode !== "payment" || session.status !== "complete" ||
      session.payment_status !== "paid" ||
      !/^cs_test_[A-Za-z0-9]+$/.test(asString(session.id)) ||
      !/^pi_[A-Za-z0-9]+$/.test(asString(session.payment_intent))) {
    return {ok:false, reason:"not_a_paid_test_session"};
  }
  const meta = session.metadata || {};
  if (asString(meta.routeq_test_marker) !== TEST_MARKER ||
      asString(meta.line_user_id) !== TEST_USER ||
      asString(session.client_reference_id) !== TEST_USER) {
    return {ok:false, reason:"not_the_isolated_fixture"};
  }
  const code = asString(meta.ticket_code), def = TICKETS[code];
  if (!def || asString(session.currency).toLowerCase() !== "jpy" ||
      !Number.isSafeInteger(session.amount_total) || session.amount_total !== def.amount ||
      asString(meta.grant_count) !== String(def.count)) {
    return {ok:false, reason:"ticket_identity_mismatch"};
  }
  return {ok:true, session:{
    id:session.id, payment_intent:session.payment_intent, livemode:false,
    mode:"payment", status:"complete", payment_status:"paid",
    amount_total:def.amount, currency:"jpy", client_reference_id:TEST_USER,
    metadata:{line_user_id:TEST_USER, display_name:"ROUTEQ isolated TEST",
      routeq_test_marker:TEST_MARKER, ticket_code:code, grant_count:String(def.count)}
  }};
}

function readiness({ enabled, webhookSecret, stripeTestKey, sharedSecret, gasUrl }) {
  let parsed;
  try { parsed = new URL(gasUrl); } catch { return false; }
  return enabled === "ON" && /^whsec_/.test(webhookSecret) &&
    /^(sk_test_|rk_test_)/.test(stripeTestKey) &&
    sharedSecret.length >= 32 &&
    parsed.protocol === "https:" &&
    parsed.hostname === "script.google.com" &&
    /^\/macros\/s\/[^/]+\/exec$/.test(parsed.pathname) &&
    parsed.searchParams.get("action") === "routeqQaStripeTestWebhook";
}

export function createRouteqQaTestGateway({
  enabled = process.env.ROUTEQ_QA_STRIPE_TEST_ENABLED || "OFF",
  webhookSecret = process.env.ROUTEQ_QA_STRIPE_TEST_WEBHOOK_SECRET || "",
  stripeTestKey = process.env.ROUTEQ_QA_STRIPE_TEST_SECRET_KEY || "",
  sharedSecret = process.env.ROUTEQ_QA_STRIPE_TEST_GATEWAY_SECRET || "",
  gasUrl = process.env.ROUTEQ_QA_STRIPE_TEST_GAS_URL || "",
  stripeClient,
  fetchImpl = globalThis.fetch,
  clock = () => Date.now()
} = {}) {
  const app = express();
  const ready = readiness({enabled,webhookSecret,stripeTestKey,sharedSecret,gasUrl});
  app.get("/health", (_req, res) => res.status(200).json({
    ok:true, service:"routeq-qa-stripe-isolated-test",
    enabled:ready, testAccount:TEST_ACCOUNT
  }));
  app.post("/stripe/webhook", express.raw({type:"application/json",limit:"64kb"}), async (req,res) => {
    if (!ready) return res.status(503).json({ok:false, reason:"test_gateway_disabled"});
    let stripe;
    let failureStage = "gateway_stripe_construct_failed";
    try {
      stripe = stripeClient || new Stripe(stripeTestKey);
      const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], webhookSecret);
      if (event.livemode !== false || (event.account && event.account !== TEST_ACCOUNT) ||
          !ALLOWED_TYPES.has(event.type)) {
        return res.status(200).json({received:true, ignored:true});
      }
      const id = asString(event.data?.object?.id);
      if (!/^cs_test_[A-Za-z0-9]+$/.test(id)) {
        return res.status(200).json({received:true, ignored:true});
      }
      // Never trust a fixture merely because the event body claims payment.
      // Retrieve the authoritative Checkout Session using a TEST-only key.
      failureStage = "gateway_stripe_retrieve_failed";
      const retrieved = await stripe.checkout.sessions.retrieve(id);
      if (retrieved.id !== id) throw new Error("retrieved_session_mismatch");
      const checked = validateIsolatedTestSession(retrieved);
      if (!checked.ok) return res.status(200).json({received:true, ignored:true});
      const payload = JSON.stringify({
        v:1, source:"ROUTEQ_QA_TEST_GATEWAY", stripeAccount:TEST_ACCOUNT,
        eventId:event.id, eventType:event.type, session:checked.session
      });
      const timestamp = Math.floor(clock() / 1000);
      const signature = createHmac("sha256",sharedSecret).update(timestamp+"."+payload,"utf8").digest("hex");
      failureStage = "gateway_gas_fetch_failed";
      const response = await fetchImpl(gasUrl,{
        method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},
        body:JSON.stringify({timestamp,payload,signature}),
        redirect:"follow", signal:AbortSignal.timeout(20000)
      });
      failureStage = "gateway_gas_http_failed";
      if (!response.ok) throw new Error("gas_http_rejected");
      failureStage = "gateway_gas_json_failed";
      const decoded = await response.json();
      failureStage = "gateway_gas_validation_failed";
      if (!decoded || decoded.ok !== true || decoded.environment !== "ISOLATED_TEST") {
        const reason = asString(decoded?.reason);
        throw new Error(SAFE_GAS_FAILURE_REASONS.has(reason) ? reason : "gas_grant_not_confirmed");
      }
      // No ephemeral in-memory idempotency: GAS Payments state is the durable source.
      return res.status(200).json({received:true, verified:true, accepted:true});
    } catch (error) {
      // No request body, token, signing secret or customer details in logs.
      const errorMessage = asString(error?.message);
      const signatureFailed = failureStage === "gateway_stripe_construct_failed" &&
        /signature/i.test(errorMessage);
      return res.status(signatureFailed?400:500).json({
        ok:false, reason:signatureFailed?"invalid_stripe_signature":
          (SAFE_GAS_FAILURE_REASONS.has(errorMessage) ? errorMessage :
            (SAFE_GATEWAY_FAILURE_STAGES.has(failureStage) ? failureStage : "test_processing_failed"))
      });
    }
  });
  return app;
}

export const app = createRouteqQaTestGateway();
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  app.listen(process.env.PORT || 10000, () => console.log("ROUTEQ QA TEST gateway listening"));
}
