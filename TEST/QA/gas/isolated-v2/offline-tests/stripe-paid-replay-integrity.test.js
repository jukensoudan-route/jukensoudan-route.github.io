const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Sheet {
  constructor(rows) { this.rows = rows.map((row) => row.slice()); this.writes = 0; }
  getLastRow() { return this.rows.length; }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    const sheet = this;
    return {
      getValue() { return sheet.rows[row - 1]?.[column - 1] ?? ''; },
      getValues() {
        return Array.from({ length: rowCount }, (_, r) =>
          Array.from({ length: columnCount }, (_, c) =>
            sheet.rows[row + r - 1]?.[column + c - 1] ?? ''));
      },
      setValue(value) { sheet.writes += 1; sheet.rows[row - 1][column - 1] = value; return this; },
      setValues(values) {
        sheet.writes += 1;
        values.forEach((valuesRow, r) => valuesRow.forEach((value, c) => {
          sheet.rows[row + r - 1][column + c - 1] = value;
        }));
        return this;
      }
    };
  }
  appendRow(row) { this.writes += 1; this.rows.push(row.slice()); }
}

const context = {
  console,
  ROUTE_QA: {
    PAYMENTS: 'Payments', USERS: 'Users',
    USER_COL: { MEMBER_STATUS: 3, LAST_TICKET: 4, TOTAL_PAID: 5,
      TOTAL_GRANTED: 6, REMAINING: 8, UPDATED_AT: 11 }
  },
  assertRouteqQaTestEnvironment_() {},
  routeqQaBlockSensitiveEntry_() {},
  setupSheets() {},
  LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
  findRouteUserRow_(sheet, userId) {
    for (let row = 2; row <= sheet.getLastRow(); row += 1) {
      if (String(sheet.getRange(row, 1).getValue()) === userId) return row;
    }
    return -1;
  },
  openRouteqQaTestSpreadsheet_() { return context.spreadsheet; }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Stripe連携.gs'), 'utf8'), context);

const baseSession = {
  id: 'cs_paid_replay',
  payment_intent: 'pi_paid_replay',
  payment_status: 'paid',
  amount_total: 1500,
  metadata: { line_user_id: 'U_PAID', ticket_code: 'ticket3', grant_count: '3' }
};

function paymentRow(overrides = {}) {
  const values = ['', 'U_PAID', '', 'ticket3', 1500, 3, 'cs_paid_replay',
    'pi_paid_replay', '支払済', '付与済', '', '', ''];
  const columns = { user: 1, product: 3, amount: 4, count: 5, session: 6,
    intent: 7, paymentStatus: 8, state: 9 };
  Object.entries(overrides).forEach(([key, value]) => { values[columns[key]] = value; });
  return values;
}

function session(overrides = {}) {
  const result = JSON.parse(JSON.stringify(baseSession));
  Object.entries(overrides).forEach(([key, value]) => {
    if (key === 'user') result.metadata.line_user_id = value;
    else if (key === 'product') result.metadata.ticket_code = value;
    else if (key === 'count') result.metadata.grant_count = value;
    else result[key] = value;
  });
  return result;
}

function run(rows, input) {
  const payments = new Sheet([Array(13).fill('header'), ...rows]);
  const users = new Sheet([Array(12).fill('header'),
    ['U_PAID', 'Test', '有効', '', 1500, 3, 0, 3, '', '', '', '']]);
  context.spreadsheet = { getSheetByName(name) { return name === 'Payments' ? payments : users; } };
  let result;
  let error;
  try { result = context.applyPaidStripeSession_(input); } catch (caught) { error = caught; }
  return { payments, users, result, error };
}

{
  const outcome = run([paymentRow()], session());
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.result.alreadyGranted, true);
  assert.equal(outcome.payments.writes, 0);
  assert.equal(outcome.users.writes, 0);
}

{
  const outcome = run([paymentRow({ intent: '', state: '未付与', paymentStatus: '作成' })], session());
  assert.equal(outcome.error, undefined);
  assert.equal(outcome.result.granted, true);
  assert.equal(outcome.payments.rows[1][7], 'pi_paid_replay');
  assert.equal(outcome.payments.rows[1][9], '付与済');
  assert.equal(outcome.users.rows[1][4], 3000);
  assert.equal(outcome.users.rows[1][5], 6);
  assert.equal(outcome.users.rows[1][7], 6);
}

const mismatchCases = [
  ['Session ID', [paymentRow({ session: 'cs_other' })], session()],
  ['Payment Intent ID', [paymentRow({ intent: 'pi_other' })], session()],
  ['ユーザーID', [paymentRow({ user: 'U_OTHER' })], session()],
  ['商品コード', [paymentRow({ product: 'ticket10' })], session()],
  ['金額', [paymentRow({ amount: 3500 })], session()],
  ['付与回数', [paymentRow({ count: 10 })], session()],
  ['Session金額', [paymentRow()], session({ amount_total: 3500 })],
  ['Session付与回数', [paymentRow()], session({ count: '10' })],
  ['Intent欠落・付与済', [paymentRow({ intent: '' })], session()],
  ['Intent欠落・処理中', [paymentRow({ intent: '', state: '付与処理中', paymentStatus: '支払済' })], session()],
  ['Intent欠落・不整合', [paymentRow({ intent: '', state: '要整合確認', paymentStatus: '支払済' })], session()],
  ['Intent別注文使用済み', [paymentRow({ intent: '', state: '未付与', paymentStatus: '作成' }),
    paymentRow({ session: 'cs_other', intent: 'pi_paid_replay' })], session()],
  ['重複Session', [paymentRow(), paymentRow({ intent: 'pi_second' })], session()]
];

for (const [label, rows, input] of mismatchCases) {
  const outcome = run(rows, input);
  assert.match(String(outcome.error && outcome.error.message), /手動整合確認/,
    label + ' must require manual reconciliation');
  assert.equal(outcome.users.writes, 0, label + ' must not update Users');
  assert.equal(outcome.payments.writes, 0, label + ' must not overwrite Payments');
  assert.equal(outcome.payments.rows[1][7], rows[0][7], label + ' must preserve saved Intent');
}

console.log('Stripe paid replay integrity: 15/15 PASS');
