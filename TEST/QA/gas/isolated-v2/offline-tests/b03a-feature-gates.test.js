const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = ['00_isolation_guard.gs', '03_isolated_v2_stops.gs']
  .map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
const scriptId = '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
const sheetId = '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';
const props = new Map([
  ['ROUTEQ_QA_ENVIRONMENT', 'ISOLATED_TEST'],
  ['ROUTEQ_QA_SHEET_ID', sheetId],
  ['ROUTEQ_QA_EXTERNAL_SEND', 'DISABLED'],
  ['ROUTEQ_QA_LIVE_PAYMENT', 'DISABLED']
]);
const context = {
  ScriptApp: { getScriptId: () => scriptId },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.has(key) ? props.get(key) : null }) }
};
vm.createContext(context);
vm.runInContext(source, context);

let cases = 0;
const test = (fn) => { fn(); cases++; };
const featureNames = ['question', 'ai', 'stripe_test', 'line_manual_test'];
const keys = [
  'ROUTEQ_QA_TEST_ALLOW_QUESTION',
  'ROUTEQ_QA_TEST_ALLOW_AI',
  'ROUTEQ_QA_TEST_ALLOW_STRIPE',
  'ROUTEQ_QA_TEST_ALLOW_LINE_MANUAL'
];
for (let i = 0; i < featureNames.length; i++) {
  const feature = featureNames[i];
  const key = keys[i];
  test(() => {
    const result = context.routeqQaTestFeatureGateStatus_(feature);
    assert.equal(result.configured, false);
    assert.equal(result.externalExecutionPermitted, false);
  });
  test(() => {
    props.set(key, 'ON');
    const result = context.routeqQaTestFeatureGateStatus_(feature);
    assert.equal(result.configured, true);
    assert.equal(result.externalExecutionPermitted, false);
    props.delete(key);
  });
  test(() => {
    props.set(key, 'INVALID');
    assert.throws(() => context.routeqQaTestFeatureGateStatus_(feature), /invalid feature gate/);
    props.delete(key);
  });
  test(() => {
    props.set(key, 'OFF');
    const result = context.routeqQaTestFeatureGateStatus_(feature);
    assert.equal(result.configured, false);
    assert.equal(result.externalExecutionPermitted, false);
    props.delete(key);
  });
}
test(() => assert.throws(() => context.routeqQaTestFeatureGateStatus_('unknown'), /unrecognized feature gate/));
test(() => assert.throws(() => context.routeqQaBlockSensitiveEntry_('stripe'), /sensitive entry blocked/));
test(() => {
  props.set('ROUTEQ_QA_EXTERNAL_SEND', 'ENABLED');
  assert.throws(() => context.routeqQaTestFeatureGateStatus_('ai'), /external send/);
  props.set('ROUTEQ_QA_EXTERNAL_SEND', 'DISABLED');
});
console.log('B-03A fail-closed feature gates: ' + cases + '/' + cases + ' PASS; external operations: 0');
