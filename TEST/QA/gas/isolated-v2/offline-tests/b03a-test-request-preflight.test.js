const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = ['00_isolation_guard.gs', '03_isolated_v2_stops.gs', '04_test_request_preflight.gs']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const scriptId = '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
const sheetId = '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';
const props = new Map([
  ['ROUTEQ_QA_ENVIRONMENT', 'ISOLATED_TEST'], ['ROUTEQ_QA_SHEET_ID', sheetId],
  ['ROUTEQ_QA_EXTERNAL_SEND', 'DISABLED'], ['ROUTEQ_QA_LIVE_PAYMENT', 'DISABLED'],
  ['ROUTEQ_QA_TEST_ALLOW_STRIPE', 'ON'], ['ROUTEQ_QA_TEST_ALLOW_AI', 'ON'],
  ['ROUTEQ_QA_TEST_ALLOW_LINE_MANUAL', 'ON']
]);
const ctx = {
  ScriptApp: { getScriptId: () => scriptId },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) ?? null }) }
};
vm.createContext(ctx);
vm.runInContext(source, ctx);
let cases = 0;
const test = fn => { fn(); cases++; };
const valid = [
  ['stripe_test', 'https://api.stripe.com/v1/checkout/sessions'],
  ['stripe_test', 'https://api.stripe.com/v1/payment_intents/pi_test_example'],
  ['ai', 'https://api.openai.com/v1/responses'],
  ['line_manual_test', 'https://api.line.me/v2/bot/message/push']
];
for (const [f, url] of valid) test(() => {
  const result = ctx.routeqQaInspectTestRequest_(f, url, 'POST');
  assert.equal(result.endpointValidated, true);
  assert.equal(result.executionAuthorized, false);
});
for (const url of [
  'http://api.stripe.com/v1/checkout/sessions',
  'https://api.stripe.com.evil.example/v1/checkout/sessions',
  'https://api.stripe.com@evil.example/v1/checkout/sessions',
  'https://api.stripe.com:443/v1/checkout/sessions',
  'https://api.stripe.com/v1/checkout/sessions?redirect=evil',
  'https://api.stripe.com/v1/checkout/sessions#fragment',
  'https://api.stripe.com/v1/charges',
  'https://evil.example/api.stripe.com/v1/checkout/sessions'
]) test(() => assert.throws(() => ctx.routeqQaInspectTestRequest_('stripe_test', url, 'POST'), /rejected/));
test(() => assert.throws(() => ctx.routeqQaInspectTestRequest_('stripe_test', valid[0][1], 'GET'), /rejected/));
test(() => assert.throws(() => ctx.routeqQaInspectTestRequest_('question', valid[0][1], 'POST'), /unsupported/));
test(() => {
  props.set('ROUTEQ_QA_TEST_ALLOW_STRIPE', 'OFF');
  assert.throws(() => ctx.routeqQaInspectTestRequest_('stripe_test', valid[0][1], 'POST'), /gate OFF/);
  props.set('ROUTEQ_QA_TEST_ALLOW_STRIPE', 'ON');
});
test(() => {
  props.set('ROUTEQ_QA_ENVIRONMENT', 'PRODUCTION');
  assert.throws(() => ctx.routeqQaInspectTestRequest_('stripe_test', valid[0][1], 'POST'), /ISOLATED_TEST/);
  props.set('ROUTEQ_QA_ENVIRONMENT', 'ISOLATED_TEST');
});
console.log('B-03A TEST request preflight: ' + cases + '/' + cases + ' PASS; external requests: 0');
