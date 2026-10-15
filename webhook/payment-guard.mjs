// This guard protects legacy Render's live-mode payment fulfilment.
// Stripe TEST events must never reach the operational GAS ticket ledger.
export const LIVE_QA_PRODUCTS = Object.freeze({
  ticket3: Object.freeze({ amount: 1000, grantCount: 3 }),
  ticket10: Object.freeze({ amount: 3000, grantCount: 10 })
});

const ALLOWED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded"
]);

function deny(reason) {
  return { allowed: false, reason };
}

/**
 * Pure validation after Stripe verifies the signed, unmodified raw request body.
 * This is a preflight guard, not a replacement for GAS checking the stored order
 * with Stripe and enforcing one grant per Checkout Session / PaymentIntent.
 */
export function vetStripeCheckoutForLegacyLive(event) {
  if (event?.livemode !== true) return deny("non_live_event");
  if (!ALLOWED_EVENTS.has(event?.type)) return deny("unsupported_event");

  const session = event?.data?.object;
  if (!session || session.object !== "checkout.session" ||
      session.livemode !== true ||
      typeof session.id !== "string" ||
      !session.id.startsWith("cs_live_")) {
    return deny("invalid_live_checkout_session");
  }

  if (session.mode !== "payment" ||
      session.status !== "complete" ||
      session.payment_status !== "paid") {
    return deny("payment_not_final");
  }

  if (session.currency !== "jpy" ||
      !Number.isSafeInteger(session.amount_total) ||
      session.amount_total <= 0) {
    return deny("invalid_amount_or_currency");
  }

  const ticketCode = String(session.metadata?.ticket_code || "").trim();
  const ticket = Object.hasOwn(LIVE_QA_PRODUCTS, ticketCode)
    ? LIVE_QA_PRODUCTS[ticketCode] : null;
  if (!ticket) return deny("not_supported_qa_product");

  if (session.amount_total !== ticket.amount ||
      String(session.metadata?.grant_count || "") !== String(ticket.grantCount)) {
    return deny("product_price_or_grant_mismatch");
  }

  const metadataUser = String(session.metadata?.line_user_id || "").trim();
  const referencedUser = String(session.client_reference_id || "").trim();
  if (!metadataUser || !referencedUser || metadataUser !== referencedUser) {
    return deny("purchase_user_mismatch");
  }

  if (typeof session.payment_intent !== "string" ||
      !session.payment_intent.startsWith("pi_")) {
    return deny("missing_payment_intent");
  }

  return { allowed: true, sessionId: session.id, ticketCode };
}
