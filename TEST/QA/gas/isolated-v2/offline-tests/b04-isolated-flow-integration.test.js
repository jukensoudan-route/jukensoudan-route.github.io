const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Range {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }
  getValue() { return this.sheet.value(this.row, this.column); }
  getValues() {
    return Array.from({ length: this.rowCount }, (_, r) =>
      Array.from({ length: this.columnCount }, (_, c) =>
        this.sheet.value(this.row + r, this.column + c)));
  }
  setValue(value) { return this.setValues([[value]]); }
  setValues(values) {
    this.sheet.writes += 1;
    values.forEach((valuesRow, r) => valuesRow.forEach((value, c) => {
      this.sheet.set(this.row + r, this.column + c, value);
    }));
    return this;
  }
}

class Sheet {
  constructor(rows = []) {
    this.rows = rows.map((row) => row.slice());
    this.writes = 0;
  }
  value(row, column) { return this.rows[row - 1]?.[column - 1] ?? ''; }
  set(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    this.rows[row - 1][column - 1] = value;
  }
  getLastRow() { return this.rows.length; }
  getMaxColumns() { return Math.max(0, ...this.rows.map((row) => row.length)); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    if (typeof row === 'string') {
      const match = /^([A-Z]+)(\d+)$/.exec(row);
      assert.ok(match, 'Only single-cell A1 ranges are used by this test');
      let col = 0;
      for (const char of match[1]) col = col * 26 + char.charCodeAt(0) - 64;
      return new Range(this, Number(match[2]), col);
    }
    return new Range(this, row, column, rowCount, columnCount);
  }
  appendRow(row) { this.writes += 1; this.rows.push(row.slice()); }
  deleteRow(row) { this.writes += 1; this.rows.splice(row - 1, 1); }
}

const propertiesData = new Map();
const properties = {
  getProperty(key) { return propertiesData.get(key) ?? null; },
  setProperty(key, value) { propertiesData.set(key, String(value)); },
  deleteProperty(key) { propertiesData.delete(key); }
};

const users = new Sheet([
  Array(12).fill('header'),
  ['U_B04', 'B04 Tester', '有効', '', 0, 0, 0, 0, '未使用', '', '', '']
]);
const payments = new Sheet([
  Array(13).fill('header'),
  ['', 'U_B04', 'B04 Tester', 'ticket3', 1000, 3,
    'cs_b04', '', '作成', '未付与', '', '', '']
]);
const questionHeaders = [
  '受付日時', 'LINEユーザーID', '表示名', '大項目', '質問テーマ', '学区',
  '高校名', '質問内容', 'AI回答案', '最終回答', 'AI生成状態', '確認済み',
  '送信状態', 'LINE送信日時', '最終更新日時', '利用チケット', '質問後残り回数',
  '訂正後回答', '訂正理由', '共通ルール候補', 'ルール案', 'ルール承認', ''
];
const questions = new Sheet([questionHeaders]);
const review = new Sheet(Array.from({ length: 50 }, () => []));
const sheets = { Users: users, Payments: payments, Questions: questions, '回答確認': review };
const spreadsheet = { getSheetByName(name) { return sheets[name] || null; } };

let externalRequests = 0;
const alerts = [];
const context = {
  console,
  Utilities: { getUuid: (() => { let n = 0; return () => `b04-uuid-${++n}`; })() },
  PropertiesService: { getScriptProperties() { return properties; } },
  LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
  SpreadsheetApp: {
    getUi() { return { alert(...args) { alerts.push(args); }, ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' }, Button: { YES: 'YES' } }; },
    getActive() { return { toast() {} }; }
  },
  assertRouteqQaTestEnvironment_() {},
  routeqQaBlockSensitiveEntry_() {},
  routeqQaRejectExternalFetch_() { externalRequests += 1; throw new Error('network forbidden'); },
  setupSheets() {},
  openRouteqQaTestSpreadsheet_() { return spreadsheet; }
};
vm.createContext(context);
for (const file of ['訂正シート最優先・直接参照.gs', 'Stripe連携.gs', '回答確認.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}

context.setupSheets = () => {};
context.findRouteUserRow_ = () => 2;
context.verifyLineUser_ = () => ({ sub: 'U_B04', name: 'B04 Tester' });
context.consumeRouteValidationToken_ = () => true;
context.makeRouteValidationFingerprint_ = (userId, data) => userId + '|' + JSON.stringify(data);
context.generateAiDraft_ = () => '隔離TESTのAI回答案';
context.autoSendRouteAnswerIfEnabled_ = () => {};
context.loadQuestionToReview_ = () => {};
const questionColumns = vm.runInContext('ROUTE_QA.QUESTION_COL', context);

context.assertRouteQuestionSchemaReady_(questions);
const mismatchedQuestionsHeader = new Sheet([questionHeaders.slice()]);
mismatchedQuestionsHeader.set(1, 18, '質問送信ID');
assert.throws(
  () => context.assertRouteQuestionSchemaReady_(mismatchedQuestionsHeader),
  /管理者による列移行と整合確認が必要/
);
assert.equal(mismatchedQuestionsHeader.value(1, 18), '質問送信ID', 'mismatched header is preserved');

const paid = context.applyPaidStripeSession_({
  id: 'cs_b04', payment_intent: 'pi_b04', payment_status: 'paid', amount_total: 1000,
  metadata: { line_user_id: 'U_B04', ticket_code: 'ticket3', grant_count: '3' }
});
assert.equal(paid.granted, true);
assert.equal(users.value(2, 8), 3, 'paid session grants three remaining uses');
assert.equal(payments.value(2, 8), 'pi_b04', 'Payment Intent is persisted');
assert.equal(payments.value(2, 9), '支払済', 'paid status is finalized');
assert.equal(payments.value(2, 10), '付与済', 'grant is finalized');

const submission = context.saveQuestionForWeb_({
  idToken: 'mock-id-token', category: 'school', categoryLabel: '学校',
  theme: '特徴', district: 'test', districtLabel: 'TEST', school: 'TEST高校',
  question: 'B-04結合テストの質問', questionSource: 'manual',
  validationToken: '1.b04-submission.' + 'a'.repeat(64)
});
assert.equal(submission.questionRow, 2);
assert.equal(submission.remainingCount, 2);
assert.equal(users.value(2, 7), 1, 'usage count increments once');
assert.equal(users.value(2, 8), 2, 'remaining count decrements once');
assert.equal(questions.value(2, questionColumns.AI_ANSWER), '隔離TESTのAI回答案');
assert.equal(Array.from(questions.rows[1].slice(17, 22)).join('|'), '||||', 'existing R:V fields remain untouched');
assert.equal(questions.value(2, questionColumns.SUBMISSION_ID), '1.b04-submission.' + 'a'.repeat(64));

review.set(3, 3, 2);
review.set(34, 1, '経営者本人が確認した最終回答（模擬）');
context.saveFinalAnswer();
assert.equal(questions.value(2, questionColumns.FINAL_ANSWER), '経営者本人が確認した最終回答（模擬）');
assert.equal(questions.value(2, questionColumns.CONFIRMED), '確認済');

const writesBeforeLineGate = questions.writes;
context.routeqQaBlockSensitiveEntry_ = (operation) => {
  throw new Error('Isolated TEST: sensitive entry blocked: ' + operation);
};
assert.throws(() => context.sendCurrentAnswerToLine(), /sensitive entry blocked: sendCurrentAnswerToLine/);
assert.equal(questions.writes, writesBeforeLineGate, 'LINE gate blocks before sheet mutation');
assert.equal(externalRequests, 0, 'no external transport is attempted');

console.log('B-04 isolated flow integration: 22/22 PASS; external requests: 0');
