const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', '00_isolation_guard.gs'), 'utf8');
const scriptId = '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
const sheetId = '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';
const props = new Map([['ROUTEQ_QA_ENVIRONMENT', 'ISOLATED_TEST'], ['ROUTEQ_QA_SHEET_ID', sheetId], ['ROUTEQ_QA_EXTERNAL_SEND', 'DISABLED'], ['ROUTEQ_QA_LIVE_PAYMENT', 'DISABLED']]);
let currentScriptId = scriptId;
let returnedSheetId = sheetId;
let opens = 0;
const context = {
  ScriptApp: { getScriptId: () => currentScriptId },
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) }) },
  SpreadsheetApp: { openById(id) { opens++; assert.equal(id, sheetId); return { getId: () => returnedSheetId }; } }
};
vm.createContext(context);
vm.runInContext(source, context);
let tests = 0;
function pass(action) { action(); tests++; }
pass(() => assert.equal(context.assertRouteqQaTestEnvironment_(), true));
pass(() => assert.equal(context.openRouteqQaTestSpreadsheet_().getId(), sheetId));
pass(() => { currentScriptId = 'wrong-project'; assert.throws(() => context.openRouteqQaTestSpreadsheet_(), /unexpected Apps Script/); currentScriptId = scriptId; });
for (const [key, value, pattern] of [
  ['ROUTEQ_QA_ENVIRONMENT', 'PRODUCTION', /ISOLATED_TEST/],
  ['ROUTEQ_QA_SHEET_ID', '12QPlcvkLLVFStZ9bMahpfQvMo1mpwSxUB41el7rTQTE', /spreadsheet mismatch/],
  ['ROUTEQ_QA_EXTERNAL_SEND', 'ENABLED', /external send/],
  ['ROUTEQ_QA_LIVE_PAYMENT', 'ENABLED', /live payments/]
]) {
  pass(() => { const old = props.get(key); props.set(key, value); assert.throws(() => context.openRouteqQaTestSpreadsheet_(), pattern); props.set(key, old); });
}
pass(() => { returnedSheetId = 'unexpected'; assert.throws(() => context.openRouteqQaTestSpreadsheet_(), /spreadsheet identity mismatch/); returnedSheetId = sheetId; });
assert.equal(opens, 3);
console.log('TEST GAS/Sheets environment boundary: ' + tests + '/' + tests + ' PASS; network requests: 0');
