const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Range {
  constructor(sheet, row, column, rows = 1, columns = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rows = rows;
    this.columns = columns;
  }
  getValue() {
    return this.sheet.value(this.row, this.column);
  }
  setValue(value) {
    this.sheet.set(this.row, this.column, value);
    return this;
  }
  getValues() {
    return Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.columns }, (_, c) =>
        this.sheet.value(this.row + r, this.column + c)
      )
    );
  }
  setValues(values) {
    if (this.sheet.failNextBatchAtColumn === this.column) {
      this.sheet.failNextBatchAtColumn = null;
      throw new Error('injected batch failure at column ' + this.column);
    }
    for (let r = 0; r < this.rows; r += 1) {
      for (let c = 0; c < this.columns; c += 1) {
        this.sheet.set(this.row + r, this.column + c, values[r][c]);
      }
    }
    this.sheet.batchWrites += 1;
    return this;
  }
}

class Sheet {
  constructor(rows) {
    this.rows = rows.map((row) => row.slice());
    this.batchWrites = 0;
    this.failNextBatchAtColumn = null;
  }
  value(row, column) {
    return (this.rows[row - 1] || [])[column - 1] ?? '';
  }
  set(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
  getRange(row, column, rows, columns) {
    return new Range(this, row, column, rows, columns);
  }
  appendRow(row) {
    this.rows.push(row.slice());
  }
  getLastRow() {
    return this.rows.length;
  }
}

const context = {
  console,
  ROUTE_QA: {
    PAYMENTS: 'Payments',
    USERS: 'Users',
    USER_COL: {
      MEMBER_STATUS: 3,
      LAST_TICKET: 4,
      TOTAL_PAID: 5,
      TOTAL_GRANTED: 6,
      REMAINING: 8,
      UPDATED_AT: 11
    }
  },
  findRouteUserRow_(sheet, lineUserId) {
    for (let row = 2; row <= sheet.getLastRow(); row += 1) {
      if (String(sheet.value(row, 1)) === lineUserId) return row;
    }
    return -1;
  },
  assertRouteqQaTestEnvironment_() {},
  routeqQaBlockSensitiveEntry_() {},
  setupSheets() {},
  LockService: {
    getScriptLock() {
      return { waitLock() {}, releaseLock() {} };
    }
  },
  openRouteqQaTestSpreadsheet_() {
    return context.currentSpreadsheet;
  }
};
vm.createContext(context);
const source = fs.readFileSync(
  path.join(__dirname, '..', 'Stripe連携.gs'),
  'utf8'
);
vm.runInContext(source, context, { filename: 'Stripe連携.gs' });

const session = {
  id: 'cs_test_recovery',
  payment_intent: 'pi_test_recovery',
  metadata: { line_user_id: 'U_TEST', ticket_code: 'TICKET_5' }
};
const def = { amount: 1000, count: 5, label: '5回券' };

function userRow(paid, granted, remaining) {
  return ['U_TEST', 'Test', '有効', '', paid, granted, 0, remaining, '', '', '', ''];
}

function journal(before, after) {
  return JSON.stringify({
    version: 1,
    sessionId: session.id,
    paymentIntentId: session.payment_intent,
    lineUserId: 'U_TEST',
    ticketCode: 'TICKET_5',
    amount: 1000,
    count: 5,
    before,
    after
  });
}

function paymentSheet(rawJournal = journal(
  { totalPaid: 0, totalGranted: 0, remaining: 0 },
  { totalPaid: 1000, totalGranted: 5, remaining: 5 }
)) {
  return new Sheet([
    Array(13).fill('header'),
    ['', 'U_TEST', '', 'TICKET_5', 1000, 5, session.id,
      session.payment_intent, '支払済', '付与処理中', '', '', rawJournal]
  ]);
}

{
  const payments = paymentSheet();
  const users = new Sheet([Array(12).fill('header'), userRow(1000, 5, 5)]);
  const result = context.recoverInterruptedStripeGrant_(
    payments, 2, users, session, def
  );
  assert.equal(result.alreadyGranted, true);
  assert.equal(result.recovered, true);
  assert.equal(users.batchWrites, 0);
  assert.equal(payments.value(2, 10), '付与済');
}

{
  const payments = paymentSheet();
  const users = new Sheet([Array(12).fill('header'), userRow(0, 0, 0)]);
  const result = context.recoverInterruptedStripeGrant_(
    payments, 2, users, session, def
  );
  assert.equal(result.granted, true);
  assert.equal(users.value(2, 5), 1000);
  assert.equal(users.value(2, 6), 5);
  assert.equal(users.value(2, 8), 5);
  assert.equal(users.batchWrites, 1);
  assert.equal(payments.value(2, 10), '付与済');
}

{
  const payments = paymentSheet();
  const users = new Sheet([Array(12).fill('header')]);
  const result = context.recoverInterruptedStripeGrant_(
    payments, 2, users, session, def
  );
  assert.equal(result.granted, true);
  assert.equal(users.getLastRow(), 2);
  assert.equal(users.value(2, 8), 5);
}

{
  const payments = paymentSheet();
  const users = new Sheet([Array(12).fill('header'), userRow(0, 0, 2)]);
  assert.throws(
    () => context.recoverInterruptedStripeGrant_(payments, 2, users, session, def),
    /付与前後のどちらにも一致しません/
  );
  assert.equal(payments.value(2, 10), '要整合確認');
}

{
  const payments = paymentSheet('{broken');
  const users = new Sheet([Array(12).fill('header'), userRow(0, 0, 0)]);
  assert.throws(
    () => context.recoverInterruptedStripeGrant_(payments, 2, users, session, def),
    /復旧ジャーナルが不正/
  );
  assert.equal(payments.value(2, 10), '要整合確認');
}

{
  const mismatched = JSON.parse(paymentSheet().value(2, 13));
  mismatched.sessionId = 'cs_other';
  const payments = paymentSheet(JSON.stringify(mismatched));
  const users = new Sheet([Array(12).fill('header'), userRow(0, 0, 0)]);
  assert.throws(
    () => context.recoverInterruptedStripeGrant_(payments, 2, users, session, def),
    /Sessionが一致しません/
  );
  assert.equal(payments.value(2, 10), '要整合確認');
}

{
  const malformed = JSON.parse(paymentSheet().value(2, 13));
  malformed.after.remaining = 500;
  const payments = paymentSheet(JSON.stringify(malformed));
  const users = new Sheet([Array(12).fill('header'), userRow(0, 0, 0)]);
  assert.throws(
    () => context.recoverInterruptedStripeGrant_(payments, 2, users, session, def),
    /Sessionが一致しません/
  );
  assert.equal(users.batchWrites, 0);
  assert.equal(payments.value(2, 10), '要整合確認');
}

{
  const retrySession = {
    id: 'cs_test_full_retry',
    payment_intent: 'pi_test_full_retry',
    payment_status: 'paid',
    amount_total: 1000,
    metadata: { line_user_id: 'U_TEST', ticket_code: 'ticket3', grant_count: '3' }
  };
  const payments = new Sheet([
    Array(13).fill('header'),
    ['', 'U_TEST', '', 'ticket3', 1000, 3, retrySession.id,
      retrySession.payment_intent, '支払済', '未付与', '', '', '']
  ]);
  const users = new Sheet([Array(12).fill('header'), userRow(0, 0, 0)]);
  context.currentSpreadsheet = {
    getSheetByName(name) {
      return name === 'Payments' ? payments : users;
    }
  };
  payments.failNextBatchAtColumn = 9;
  assert.throws(
    () => context.applyPaidStripeSession_(retrySession),
    /injected batch failure/
  );
  assert.equal(users.value(2, 8), 3);
  assert.equal(payments.value(2, 10), '付与処理中');

  const recovered = context.applyPaidStripeSession_(retrySession);
  assert.equal(recovered.alreadyGranted, true);
  assert.equal(recovered.recovered, true);
  assert.equal(users.value(2, 8), 3);
  assert.equal(payments.value(2, 10), '付与済');
}

console.log('Stripe grant recovery: 8/8 PASS');
