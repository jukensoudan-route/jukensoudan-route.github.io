import test from "node:test";
import assert from "node:assert/strict";
import { verifyGasConfirmationResponse } from "./gas-confirmation.mjs";

const eventId = "evt_local_fixture";
const sample = {
  ok: true,
  type: "confirmCheckout",
  requestId: "stripe-webhook-" + eventId,
  result: {
    paymentStatus: "paid",
    granted: true,
    alreadyGranted: false,
    remainingCount: 3
  }
};
const html = obj => '<html><script>const message={source:"route-qa-gas",payload:'
  + JSON.stringify(obj) + '};</script></html>';
const reject = (body, id = eventId) => assert.throws(() => verifyGasConfirmationResponse(body, id));

test("realistic GAS HtmlService payload: newly granted", () => {
  assert.deepEqual(verifyGasConfirmationResponse(html(sample), eventId), {
    granted: true, alreadyGranted: false, remainingCount: 3
  });
});
test("confirmed duplicate delivery is acknowledged without a new grant", () => {
  assert.deepEqual(verifyGasConfirmationResponse(html({
    ...sample, result: { ...sample.result, granted: false, alreadyGranted: true }
  }), eventId), { granted: false, alreadyGranted: true, remainingCount: 3 });
});
test("escaped HtmlService quote entities are supported", () => {
  assert.equal(verifyGasConfirmationResponse(
    html(sample).replaceAll('"', '&quot;'), eventId).granted, true);
});
test("plain JSON only if status and request ID are verified", () => {
  assert.equal(verifyGasConfirmationResponse(JSON.stringify(sample), eventId).granted, true);
});
test("GAS HTML 200 but no payment confirmation is rejected", () => {
  reject('<html><body>ok:true</body></html>');
});
test("outer ok flag is insufficient", () => {
  reject(html({ ...sample, result: { ...sample.result, paymentStatus: "unpaid" } }));
});
test("GAS failure envelope is rejected", () => {
  reject(html({ ok: false, type: "confirmCheckout", requestId: sample.requestId, message: "error" }));
});
test("wrong request ID cannot be acknowledged", () => {
  reject(html(sample), "evt_unrelated");
});
test("no grant and not already granted means retry or manual review", () => {
  reject(html({ ...sample, result: { ...sample.result, granted: false, alreadyGranted: false } }));
});
test("double positive flags are not a valid state", () => {
  reject(html({ ...sample, result: { ...sample.result, granted: true, alreadyGranted: true } }));
});
test("missing remaining count does not count as successful fulfilment", () => {
  reject(html({ ...sample, result: { ...sample.result, remainingCount: null } }));
});
test("invalid JSON with fake ok:true substring is rejected", () => {
  reject('<html><script>const message={payload:{ok:true,result:{}}};</script></html>');
});
test("negative grant balance rejected", () => {
  reject(html({ ...sample, result: { ...sample.result, remainingCount: -1 } }));
});
test("empty event ID never confirms", () => {
  reject(html(sample), "");
});
