import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Stripe from "stripe";
import { createWebhookApp } from "./server.js";

const secret = "whsec_offline_routeq_test";
const stripe = new Stripe("sk_test_placeholder");
const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise((resolve) => server.close(resolve))
  ));
});

function routeSession(overrides = {}) {
  return {
    id: "cs_test_routeq_1",
    object: "checkout.session",
    payment_intent: "pi_test_routeq_1",
    payment_status: "paid",
    amount_total: 1000,
    livemode: false,
    currency: "jpy",
    client_reference_id: "U_ROUTEQ_1",
    metadata: { line_user_id: "U_ROUTEQ_1", ticket_code: "ticket3", grant_count: "3" },
    ...overrides
  };
}

function event(id, session = routeSession(), type = "checkout.session.completed") {
  return { id, object: "event", livemode: false, type, data: { object: session } };
}

async function start(options = {}) {
  const calls = [];
  const fetchImpl = options.fetchImpl || (async (url, request) => {
    calls.push({ url, request, body: String(request.body) });
    return new Response('{"ok":true,"granted":true}', { status: 200 });
  });
  const app = createWebhookApp({
    webhookSecret: options.webhookSecret ?? secret,
    gasWebAppUrl: options.gasWebAppUrl ?? "https://gas.invalid/offline-mock",
    qaWebhookEnabled: options.enabled ?? true,
    stripe,
    fetchImpl
  });
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, calls };
}

async function post(base, value, signature) {
  const body = JSON.stringify(value);
  const headers = { "content-type": "application/json" };
  if (signature !== null) {
    headers["stripe-signature"] = signature || stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  }
  const response = await fetch(base + "/stripe/webhook", { method: "POST", headers, body });
  return { status: response.status, text: await response.text() };
}

test("valid signature processes one consistent ROUTEQ purchase", async () => {
  const { base, calls } = await start();
  const result = await post(base, event("evt_valid"));
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.text).processed, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body, /sessionId=cs_test_routeq_1/);
});

test("invalid signature is rejected without GAS call", async () => {
  const { base, calls } = await start();
  assert.equal((await post(base, event("evt_bad_sig"), "t=1,v1=bad")).status, 400);
  assert.equal(calls.length, 0);
});

test("missing signature is rejected without GAS call", async () => {
  const { base, calls } = await start();
  assert.equal((await post(base, event("evt_no_sig"), null)).status, 400);
  assert.equal(calls.length, 0);
});

test("duplicate event is acknowledged once and not resent", async () => {
  const { base, calls } = await start();
  await post(base, event("evt_repeat"));
  const second = await post(base, event("evt_repeat"));
  assert.equal(JSON.parse(second.text).duplicate, true);
  assert.equal(calls.length, 1);
});

test("duplicate Session ID under another event is not resent", async () => {
  const { base, calls } = await start();
  await post(base, event("evt_session_1"));
  const result = await post(base, event("evt_session_2", routeSession({ payment_intent: "pi_other" })));
  assert.equal(JSON.parse(result.text).reason, "duplicate_session");
  assert.equal(calls.length, 1);
});

test("duplicate Payment Intent under another Session is not resent", async () => {
  const { base, calls } = await start();
  await post(base, event("evt_intent_1"));
  const result = await post(base, event("evt_intent_2", routeSession({ id: "cs_other" })));
  assert.equal(JSON.parse(result.text).reason, "duplicate_payment_intent");
  assert.equal(calls.length, 1);
});

for (const [name, change, reason] of [
  ["user missing", { metadata: { ticket_code: "ticket3", grant_count: "3" }, client_reference_id: "" }, "missing_or_unknown_route_identity"],
  ["user mismatch", { client_reference_id: "U_OTHER" }, "route_user_mismatch"],
  ["product unknown", { metadata: { line_user_id: "U_ROUTEQ_1", ticket_code: "other", grant_count: "3" } }, "missing_or_unknown_route_identity"],
  ["amount mismatch", { amount_total: 999 }, "route_purchase_mismatch"],
  ["grant count mismatch", { metadata: { line_user_id: "U_ROUTEQ_1", ticket_code: "ticket3", grant_count: "10" } }, "route_purchase_mismatch"],
  ["currency mismatch", { currency: "usd" }, "route_purchase_mismatch"],
  ["payment not paid", { payment_status: "unpaid" }, "payment_not_paid"],
  ["payment intent missing", { payment_intent: "" }, "missing_or_unknown_route_identity"]
]) {
  test(`${name} cannot reach GAS or update Users`, async () => {
    const { base, calls } = await start();
    const result = await post(base, event("evt_" + name, routeSession(change)));
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.text).reason, reason);
    assert.equal(calls.length, 0);
  });
}

test("GAS HTTP error remains retryable and is not marked processed", async () => {
  let calls = 0;
  const { base } = await start({ fetchImpl: async () => {
    calls += 1;
    return new Response("failure", { status: 502 });
  } });
  assert.equal((await post(base, event("evt_gas_http"))).status, 500);
  assert.equal((await post(base, event("evt_gas_http"))).status, 500);
  assert.equal(calls, 2);
});

test("GAS logical error remains retryable and is not marked processed", async () => {
  let calls = 0;
  const { base } = await start({ fetchImpl: async () => {
    calls += 1;
    return new Response('{"ok":false,"message":"rejected"}', { status: 200 });
  } });
  assert.equal((await post(base, event("evt_gas_logic"))).status, 500);
  assert.equal(calls, 1);
});

test("forced stop returns HTTP 503 with zero outbound calls", async () => {
  const { base, calls } = await start({ enabled: false });
  assert.equal((await post(base, event("evt_disabled"))).status, 503);
  assert.equal(calls.length, 0);
});

test("missing webhook secret returns HTTP 503 with zero outbound calls", async () => {
  const { base, calls } = await start({ webhookSecret: "" });
  assert.equal((await post(base, event("evt_no_secret"))).status, 503);
  assert.equal(calls.length, 0);
});

test("unrelated signed event is ignored with zero outbound calls", async () => {
  const { base, calls } = await start();
  const result = await post(base, event("evt_unrelated", routeSession(), "customer.created"));
  assert.equal(JSON.parse(result.text).ignored, true);
  assert.equal(calls.length, 0);
});

test("official TEST prices accept only 1000/3 and 3000/10", async () => {
  const { base, calls } = await start();
  const valid10 = routeSession({
    id: "cs_test_routeq_10", payment_intent: "pi_test_routeq_10",
    amount_total: 3000,
    metadata: { line_user_id: "U_ROUTEQ_1", ticket_code: "ticket10", grant_count: "10" }
  });
  assert.equal(JSON.parse((await post(base, event("evt_valid_10", valid10))).text).processed, true);
  assert.equal(calls.length, 1);
  for (const [suffix, amount, code, count] of [
    ["old3", 1500, "ticket3", "3"],
    ["old10", 3500, "ticket10", "10"],
    ["mismatch3", 3000, "ticket3", "3"],
    ["mismatch10", 1000, "ticket10", "10"]
  ]) {
    const s = routeSession({
      id: "cs_test_routeq_" + suffix,
      payment_intent: "pi_test_routeq_" + suffix,
      amount_total: amount,
      metadata: { line_user_id: "U_ROUTEQ_1", ticket_code: code, grant_count: count }
    });
    const answer = await post(base, event("evt_" + suffix, s));
    assert.equal(JSON.parse(answer.text).reason, "route_purchase_mismatch");
  }
  assert.equal(calls.length, 1);
});
test("LIVE event, LIVE session and wrong Stripe account are never forwarded to GAS", async () => {
  const { base, calls } = await start();
  const liveEvent = {...event("evt_live"), livemode: true};
  assert.equal(JSON.parse((await post(base, liveEvent)).text).reason, "non_test_event_rejected");
  const liveSession = routeSession({ livemode: true });
  assert.equal(JSON.parse((await post(base, event("evt_live_session", liveSession))).text).reason, "non_test_session_rejected");
  const liveId = routeSession({ id: "cs_live_unexpected" });
  assert.equal(JSON.parse((await post(base, event("evt_live_id", liveId))).text).reason, "non_test_session_rejected");
  const wrongAccount = {...event("evt_wrong_account"), account: "acct_wrong"};
  assert.equal(JSON.parse((await post(base, wrongAccount)).text).reason, "test_account_mismatch");
  assert.equal(calls.length, 0);
});
