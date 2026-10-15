import test from "node:test";
import assert from "node:assert/strict";
import { vetStripeCheckoutForLegacyLive } from "./payment-guard.mjs";

const liveSession = {
  object: "checkout.session",
  id: "cs_live_testfixture",
  livemode: true,
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: 1500,
  currency: "jpy",
  payment_intent: "pi_fixture",
  client_reference_id: "U_LOCAL_FIXTURE",
  metadata: {
    ticket_code: "ticket3",
    grant_count: "3",
    line_user_id: "U_LOCAL_FIXTURE"
  }
};
const fixture = (changes = {}, eventChanges = {}) => ({
  type: "checkout.session.completed",
  livemode: true,
  data: { object: { ...liveSession, ...changes } },
  ...eventChanges
});
const reason = event => vetStripeCheckoutForLegacyLive(event).reason;

test("paid live checkout is eligible for independent GAS order check", () => {
  assert.deepEqual(vetStripeCheckoutForLegacyLive(fixture()), {
    allowed: true, sessionId: "cs_live_testfixture", ticketCode: "ticket3"
  });
});
test("paid async success is eligible", () => {
  assert.equal(vetStripeCheckoutForLegacyLive(
    fixture({}, { type: "checkout.session.async_payment_succeeded" })
  ).allowed, true);
});
test("TEST event cannot reach legacy production GAS", () => {
  assert.equal(reason(fixture({}, { livemode: false })), "non_live_event");
});
test("TEST Checkout session cannot reach production GAS", () => {
  assert.equal(reason(fixture({ livemode: false })), "invalid_live_checkout_session");
});
test("TEST Checkout session ID cannot pass", () => {
  assert.equal(reason(fixture({ id: "cs_test_fixture" })), "invalid_live_checkout_session");
});
test("unpaid Checkout cannot grant", () => {
  assert.equal(reason(fixture({ payment_status: "unpaid" })), "payment_not_final");
});
test("incomplete Checkout cannot grant", () => {
  assert.equal(reason(fixture({ status: "open" })), "payment_not_final");
});
test("other event types never call GAS", () => {
  assert.equal(reason(fixture({}, { type: "charge.refunded" })), "unsupported_event");
});
test("unapproved products cannot grant", () => {
  assert.equal(reason(fixture({ metadata: { ...liveSession.metadata, ticket_code: "ticket20" } })),
    "not_supported_qa_product");
});
test("incorrect price cannot grant", () => {
  assert.equal(reason(fixture({ amount_total: 1000 })), "product_price_or_grant_mismatch");
});
test("incorrect ticket count cannot grant", () => {
  assert.equal(reason(fixture({ metadata: { ...liveSession.metadata, grant_count: "30" } })),
    "product_price_or_grant_mismatch");
});
test("LINE user mismatch cannot grant", () => {
  assert.equal(reason(fixture({ client_reference_id: "U_OTHER_FIXTURE" })),
    "purchase_user_mismatch");
});
test("missing PaymentIntent cannot grant", () => {
  assert.equal(reason(fixture({ payment_intent: null })), "missing_payment_intent");
});
test("unexpected currency cannot grant", () => {
  assert.equal(reason(fixture({ currency: "usd" })), "invalid_amount_or_currency");
});
test("ticket10 expected price and count can pass", () => {
  assert.equal(vetStripeCheckoutForLegacyLive(fixture({
    amount_total: 3500,
    metadata: { ...liveSession.metadata, ticket_code: "ticket10", grant_count: "10" }
  })).allowed, true);
});
