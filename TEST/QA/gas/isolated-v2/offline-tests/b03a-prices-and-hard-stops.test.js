const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const load = name => fs.readFileSync(path.join(root, name), 'utf8');
const stripe = load('Stripe連携.gs');
const admin = load('回答確認.gs');
const core = load('訂正シート最優先・直接参照.gs');
const boundary = load('02_external_boundary.gs');
const stops = load('03_isolated_v2_stops.gs');
let checks = 0;
const pass = check => { check(); checks++; };
pass(() => assert.match(stripe, /ticket3:\s*\{\s*amount:\s*1000,/));
pass(() => assert.match(stripe, /ticket10:\s*\{\s*amount:\s*3000,/));
pass(() => assert.match(admin, /grantRouteTicket_\(\s*1000,\s*3,\s*'1,000円／3回'/));
pass(() => assert.match(admin, /grantRouteTicket_\(\s*3000,\s*10,\s*'3,000円／10回'/));
for (const [name, code] of [['Stripe', stripe], ['admin', admin], ['question', core], ['boundary', boundary], ['stops', stops]]) {
  pass(() => assert.doesNotMatch(code, /UrlFetchApp\s*\.\s*fetch\s*\(/, name + ' direct network call'));
}
pass(() => assert.match(boundary, /function routeqQaRejectExternalFetch_\([^)]*\)[\s\S]*?throw new Error\('ROUTEQ isolated TEST: all outbound HTTP disabled/));
pass(() => assert.match(stops, /function routeqQaBlockSensitiveEntry_\(operation\).*throw new Error\('Isolated TEST: sensitive entry blocked/));
for (const operation of ['createStripeCheckoutForWeb_', 'confirmStripeCheckoutForWeb_', 'reconcileStripePayments', 'applyPaidStripeSession_']) {
  pass(() => assert.ok(stripe.includes("routeqQaBlockSensitiveEntry_('" + operation + "')"), operation));
}
pass(() => assert.ok(core.includes("routeqQaBlockSensitiveEntry_('doPost')")));
pass(() => assert.ok(core.includes("routeqQaBlockSensitiveEntry_('sendLinePushMessage_')")));
console.log('QA prices and hard-stop regression: ' + checks + '/' + checks + ' PASS; network calls: 0');
