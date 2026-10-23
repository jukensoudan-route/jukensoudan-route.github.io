const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = ['00_isolation_guard.gs', '02_external_boundary.gs',
  '03_isolated_v2_stops.gs', '04_test_request_preflight.gs', '05_test_request_control.gs']
  .map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
const scriptId = '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
const sheetId = '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';
const routes = [
  ['stripe_test', 'https://api.stripe.com/v1/checkout/sessions', 'ROUTEQ_QA_TEST_ALLOW_STRIPE'],
  ['ai', 'https://api.openai.com/v1/responses', 'ROUTEQ_QA_TEST_ALLOW_AI'],
  ['line_manual_test', 'https://api.line.me/v2/bot/message/push', 'ROUTEQ_QA_TEST_ALLOW_LINE_MANUAL']
];
let cases = 0;
let forbiddenCalls = 0;
function fixture() {
  const props = new Map([
    ['ROUTEQ_QA_ENVIRONMENT', 'ISOLATED_TEST'], ['ROUTEQ_QA_SHEET_ID', sheetId],
    ['ROUTEQ_QA_EXTERNAL_SEND', 'DISABLED'], ['ROUTEQ_QA_LIVE_PAYMENT', 'DISABLED'],
    ...routes.map(([, , key]) => [key, 'ON'])
  ]);
  const state = { now: 100000, scriptId };
  const forbidden = () => { forbiddenCalls++; throw new Error('forbidden capability touched'); };
  const ctx = vm.createContext({
    Date: { now: () => state.now },
    ScriptApp: { getScriptId: () => state.scriptId },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) ?? null }) },
    UrlFetchApp: { fetch: forbidden, fetchAll: forbidden },
    DriveApp: new Proxy({}, { get: forbidden }),
    SpreadsheetApp: new Proxy({}, { get: forbidden }),
    fetch: forbidden
  });
  vm.runInContext(source, ctx);
  return { ctx, props, state, prepare: (...args) => ctx.routeqQaPrepareOfflineTestRequest_(...args) };
}
function test(fn) { fn(fixture()); cases++; }
for (const [feature, url, gate] of routes) {
  const prepare = f => f.prepare(feature, url, 'POST');
  test(f => {
    const handle = prepare(f);
    assert.equal(Object.isFrozen(handle), true);
    assert.equal(handle.executionAuthorized, false);
    assert.equal(handle.externalExecutionPermitted, false);
    const result = handle.simulate('OFFLINE_DRY_RUN');
    assert.equal(Object.isFrozen(result), true);
    assert.equal(result.state, 'OFFLINE_SIMULATED');
    assert.equal(result.feature, feature);
    assert.equal(result.executionAuthorized, false);
    assert.equal(result.externalExecutionPermitted, false);
    assert.equal(result.networkRequests, 0);
    assert.throws(() => handle.simulate('OFFLINE_DRY_RUN'), /already consumed/);
    // A successful simulation cannot unlock the existing network boundary.
    assert.throws(() => f.ctx.routeqQaRejectExternalFetch_(url, {}), /all outbound HTTP disabled/);
    assert.throws(() => f.ctx.routeqQaBlockSensitiveEntry_(feature), /sensitive entry blocked/);
  });
  for (const setting of ['OFF', undefined, 'INVALID']) test(f => {
    const handle = prepare(f);
    f.props.set(gate, setting);
    assert.throws(() => handle.simulate('OFFLINE_DRY_RUN'), /gate OFF|invalid feature gate/);
    f.props.set(gate, 'ON');
    assert.throws(() => handle.simulate('OFFLINE_DRY_RUN'), /already consumed/);
  });
  for (const mode of [undefined, 'EXECUTE', 'ON', true, {}, () => { forbiddenCalls++; }]) test(f => {
    const handle = prepare(f);
    assert.throws(() => handle.simulate(mode), /external execution disabled/);
    assert.throws(() => handle.simulate('OFFLINE_DRY_RUN'), /already consumed/);
  });
  for (const elapsed of [60000, 60001, -1, NaN, Infinity, 0.5]) test(f => {
    const handle = prepare(f);
    f.state.now += elapsed;
    assert.throws(() => handle.simulate('OFFLINE_DRY_RUN'), /expired or invalid clock/);
  });
  test(f => {
    const handle = prepare(f);
    f.state.now += 59999;
    assert.equal(handle.simulate('OFFLINE_DRY_RUN').networkRequests, 0);
  });
  for (const mutate of [
    f => { f.state.scriptId = 'production'; },
    f => f.props.set('ROUTEQ_QA_SHEET_ID', 'production'),
    f => f.props.set('ROUTEQ_QA_ENVIRONMENT', 'PRODUCTION'),
    f => f.props.set('ROUTEQ_QA_EXTERNAL_SEND', 'ENABLED'),
    f => f.props.set('ROUTEQ_QA_LIVE_PAYMENT', 'ENABLED')
  ]) test(f => {
    const handle = prepare(f);
    mutate(f);
    assert.throws(() => handle.simulate('OFFLINE_DRY_RUN'), /project ID|mismatch|ISOLATED_TEST|external send|live payments/);
    assert.throws(() => handle.simulate('OFFLINE_DRY_RUN'), /already consumed/);
  });
  for (const [other, otherUrl] of routes) {
    if (other !== feature) test(f => assert.throws(() => f.prepare(feature, otherUrl, 'POST'), /rejected/));
  }
  test(f => assert.throws(() => f.prepare(feature, url, 'GET'), /rejected/));
  test(f => {
    f.props.set(gate, 'OFF');
    assert.throws(() => prepare(f), /gate OFF/);
  });
}
for (const args of [
  [{ toString() { throw new Error('coercion'); } }, routes[0][1], 'POST'],
  ['ai', new String(routes[1][1]), 'POST'],
  ['ai', routes[1][1], null]
]) test(f => assert.throws(() => f.prepare(...args), /primitive request fields required/));
assert.equal(forbiddenCalls, 0, 'offline controller touched an external capability');
console.log(`B-03A offline request control: ${cases}/${cases} PASS; forbidden capability calls: ${forbiddenCalls}`);
