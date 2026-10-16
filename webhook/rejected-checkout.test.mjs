import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldRetryRejectedCheckout, vetStripeCheckoutForLegacyLive } from "./payment-guard.mjs";

const base = {
  id: "evt_fixture", type: "checkout.session.completed", livemode: true,
  data: { object: {
    object: "checkout.session", id: "cs_live_fixture", livemode: true,
    mode: "payment", status: "complete", payment_status: "paid",
    currency: "jpy", amount_total: 1000, payment_intent: "pi_fixture",
    client_reference_id: "U_FIXTURE",
    metadata: { ticket_code: "ticket3", grant_count: "3", line_user_id: "U_FIXTURE" }
  } }
};
const fixture = (session = {}, event = {}) => ({
  ...base, ...event,
  data: { object: { ...base.data.object, ...session } }
});
const cases = [
  ["LIVE paid old price retries", true, { amount_total: 1500 }, {}],
  ["LIVE paid missing grant count retries", true,
    { metadata: { ticket_code: "ticket3", line_user_id: "U_FIXTURE" } }, {}],
  ["LIVE paid missing purchaser retries", true, { client_reference_id: null }, {}],
  ["LIVE paid unknown product retries", true,
    { metadata: { ...base.data.object.metadata, ticket_code: "ticket20" } }, {}],
  ["LIVE paid no Q&A identifier retries", true,
    { metadata: {}, client_reference_id: null }, {}],
  ["LIVE paid missing PaymentIntent retries", true, { payment_intent: null }, {}],
  ["LIVE async success with incomplete status retries", true, { payment_status: "unpaid" },
    { type: "checkout.session.async_payment_succeeded" }],
  ["LIVE ambiguous payment status retries", true, { payment_status: null }, {}],
  ["missing livemode is not proven TEST", true, {}, { livemode: undefined }],
  ["TEST event ignored", false, { livemode: false, id: "cs_test_fixture" }, { livemode: false }],
  ["TEST async event ignored", false, { livemode: false, id: "cs_test_fixture" },
    { livemode: false, type: "checkout.session.async_payment_succeeded" }],
  ["irrelevant event type ignored", false, {}, { type: "charge.updated" }],
  ["unrelated payment link ignored", false,
    { payment_link: "plink_fixture", metadata: {}, client_reference_id: null }, {}],
  ["unpaid completed Checkout ignored pending async success", false,
    { payment_status: "unpaid" }, {}]
];
for (const [name, retry, session, event] of cases) {
  test(name, () => {
    const input = fixture(session, event);
    assert.equal(vetStripeCheckoutForLegacyLive(input).allowed, false);
    assert.equal(shouldRetryRejectedCheckout(input), retry);
  });
}
test("normal LIVE Q&A passes existing gate", () => {
  assert.equal(vetStripeCheckoutForLegacyLive(base).allowed, true);
});
test("server sends retryable 503 before any generic 200 ignore", () => {
  const src = readFileSync(new URL("./server.js", import.meta.url), "utf8");
  const branch = src.indexOf("if (!gate.allowed)");
  const classify = src.indexOf("if (shouldRetryRejectedCheckout(event))", branch);
  const retry = src.indexOf("return res.status(503)", classify);
  const ignored = src.indexOf("return res.status(200)", classify);
  assert.ok(branch >= 0 && classify > branch && retry > classify && ignored > retry);
});
