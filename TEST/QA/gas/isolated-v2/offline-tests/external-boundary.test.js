const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const properties = new Map([
  ['ROUTEQ_QA_ENVIRONMENT', 'ISOLATED_TEST'],
  ['ROUTEQ_QA_SHEET_ID', '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8'],
  ['ROUTEQ_QA_EXTERNAL_SEND', 'DISABLED'],
  ['ROUTEQ_QA_LIVE_PAYMENT', 'DISABLED'],
  ['LINE_CHANNEL_ACCESS_TOKEN', 'TEST_TOKEN_MUST_NOT_BE_USED'],
  ['LINE_LOGIN_CHANNEL_ID', 'TEST_CHANNEL_MUST_NOT_BE_USED']
]);
let directNetworkCalls = 0;

const context = {
  console,
  ScriptApp: {
    getScriptId() {
      return '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
    }
  },
  PropertiesService: {
    getScriptProperties() {
      return { getProperty(key) { return properties.get(key) ?? null; } };
    }
  },
  SpreadsheetApp: {
    openById(id) {
      return { getId() { return id; } };
    }
  },
  UrlFetchApp: {
    fetch() {
      directNetworkCalls += 1;
      throw new Error('Direct network access must never be reached');
    }
  }
};
vm.createContext(context);

for (const file of [
  '00_isolation_guard.gs',
  '02_external_boundary.gs',
  '03_isolated_v2_stops.gs',
  '訂正シート最優先・直接参照.gs'
]) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    context,
    { filename: file }
  );
}

assert.equal(context.assertRouteqQaTestEnvironment_(), true);
assert.equal(context.testRouteqQaExternalBoundary().cases, 5);

assert.throws(
  () => context.routeqQaRejectExternalFetch_('https://api.line.me/v2/profile', {}),
  /outbound HTTP disabled \(LINE\)/
);
assert.throws(
  () => context.sendLinePushMessage_('U_TEST', 'safe mock answer', 'question-1'),
  /sensitive entry blocked: sendLinePushMessage_/
);
assert.throws(
  () => context.verifyLineUser_('test-access-token'),
  /outbound HTTP disabled \(LINE\)/
);
assert.throws(
  () => context.routeqQaOpenAllowedSpreadsheet_('12QPlcvkLLVFStZ9bMahpfQvMo1mpwSxUB41el7rTQTE'),
  /non-TEST spreadsheet rejected/
);
assert.throws(
  () => context.routeqQaRejectOAuthTokenAccess_(),
  /OAuth token access disabled/
);
assert.equal(directNetworkCalls, 0);

properties.set('ROUTEQ_QA_EXTERNAL_SEND', 'ENABLED');
assert.throws(
  () => context.assertRouteqQaTestEnvironment_(),
  /external send must remain DISABLED/
);

console.log('External boundary and LINE-safe mock: 8/8 PASS; network requests: 0');
