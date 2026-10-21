// ROUTEQ 04: isolated, read-only-source regression for Stripe grant identity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Sheet {
  constructor(rows) { this.rows = rows.map(r => [...r]); this.writes = 0; }
  getLastRow() { return this.rows.length; }
  getRange(row, col, nrows = 1, ncols = 1) {
    const sheet = this;
    return {
      getValue() { return sheet.rows[row - 1]?.[col - 1] ?? ''; },
      getValues() { return Array.from({length:nrows}, (_, i) =>
        Array.from({length:ncols}, (_, j) => sheet.rows[row + i - 1]?.[col + j - 1] ?? '')); },
      setValue(v) { sheet.writes++; sheet.rows[row - 1][col - 1] = v; },
      setValues(values) {
        sheet.writes++;
        values.forEach((vs, i) => vs.forEach((v, j) => {
          sheet.rows[row + i - 1][col + j - 1] = v;
        }));
      }
    };
  }
  appendRow(row) { this.writes++; this.rows.push([...row]); }
}
const context = {
  ROUTE_QA: { PAYMENTS:'Payments', USERS:'Users',
    USER_COL:{ MEMBER_STATUS:3, LAST_TICKET:4, TOTAL_PAID:5,
      TOTAL_GRANTED:6, REMAINING:8, UPDATED_AT:11 } },
  assertRouteqQaTestEnvironment_() {},
  routeqQaBlockSensitiveEntry_() {},
  setupSheets() {},
  LockService: { getScriptLock() { return { waitLock(){}, releaseLock(){} }; } },
  findRouteUserRow_(sheet, userId) {
    for (let row=2; row<=sheet.getLastRow(); row++)
      if (sheet.getRange(row,1).getValue() === userId) return row;
    return -1;
  },
  openRouteqQaTestSpreadsheet_() { return context.spreadsheet; }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Stripe連携.gs'), 'utf8'),
  context, { filename:'Stripe連携.gs' });
function row(user='U_A', session='cs_A', intent='pi_A', state='付与済') {
  return ['', user, '', 'ticket3', 1500, 3, session, intent,
    '支払済', state, '', '', ''];
}
function session(user='U_A', sid='cs_A', intent='pi_A', product='ticket3') {
  return { id:sid, payment_intent:intent, payment_status:'paid',
    metadata:{ line_user_id:user, ticket_code:product } };
}
function test(label, paymentRows, input) {
  const payments = new Sheet([Array(13).fill('header'), ...paymentRows]);
  const users = new Sheet([Array(12).fill('header'),
    ['U_A','Test','有効','',1500,3,0,3,'','','','']]);
  context.spreadsheet = { getSheetByName(name) {
    return name === 'Payments' ? payments : users;
  }};
  let rejected = false, outcome = '';
  try {
    const result = context.applyPaidStripeSession_(input);
    outcome = JSON.stringify(result);
  } catch (e) {
    rejected = true;
    outcome = String(e.message);
  }
  const safe = rejected && payments.writes === 0 && users.writes === 0;
  console.log((safe ? 'PASS' : 'FAIL') + ' ' + label + ' : ' + outcome);
  assert.equal(safe, true, label + ' must reject without modifying Payments/Users');
}
const cases = [
  ['different buyer, same session', [row()], session('U_B')],
  ['different intent, same session', [row()], session('U_A','cs_A','pi_other')],
  ['duplicate session rows', [row(), row()], session()],
  ['duplicate intent rows', [row(), row('U_B','cs_B')], session()],
  ['different session, paid same intent', [row()], session('U_A','cs_B')],
  ['different ticket, same session', [row()], session('U_A','cs_A','pi_A','ticket10')]
];
let failed=0;
for (const [name, rows, input] of cases) {
  try { test(name, rows, input); } catch { failed++; }
}
console.log('Stripe identity regression: ' + (cases.length-failed) + '/' +
  cases.length + ' PASS, ' + failed + ' FAIL');
if (failed) process.exitCode = 1;
