const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const propertyData = new Map();
const properties = {
  getProperty(key) { return propertyData.get(key) ?? null; },
  setProperty(key, value) { propertyData.set(key, String(value)); },
  deleteProperty(key) { propertyData.delete(key); }
};
let failNextUserWrite = false;
let failQuestionDelete = false;
let questionWrites = 0;
let questionRows = [];
let userValues;

function resetState() {
  propertyData.clear();
  failNextUserWrite = false;
  failQuestionDelete = false;
  questionWrites = 0;
  questionRows = [];
  userValues = ['U_TEST', 'Tester', '有効', '無料お試し', 0, 1, 0, 3, '未使用', '', '', ''];
}

const users = {
  getRange() {
    return {
      getValues() { return [userValues.slice()]; },
      setValues(values) {
        if (failNextUserWrite) {
          failNextUserWrite = false;
          throw new Error('injected Users write failure');
        }
        userValues = values[0].slice();
      }
    };
  }
};

const questions = {
  getLastRow() { return questionRows.length + 1; },
  deleteRow(row) {
    if (failQuestionDelete) throw new Error('injected Questions rollback failure');
    questionRows.splice(row - 2, 1);
  },
  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      setValues(values) {
        questionRows[row - 2] = values[0].slice();
        questionWrites += 1;
      },
      setValue(value) {
        if (questionRows[row - 2]) questionRows[row - 2][column - 1] = value;
      },
      getValue() {
        return questionRows[row - 2] ? questionRows[row - 2][column - 1] : '';
      },
      getValues() {
        return Array.from({ length: rowCount }, (_, offset) => {
          const source = questionRows[row - 2 + offset] || [];
          return source.slice(column - 1, column - 1 + columnCount);
        });
      }
    };
  }
};

const context = {
  console,
  Utilities: { getUuid: (() => { let value = 0; return () => `uuid-${++value}`; })() },
  PropertiesService: { getScriptProperties() { return properties; } },
  LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } }
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', '訂正シート最優先・直接参照.gs'), 'utf8'),
  context,
  { filename: '訂正シート最優先・直接参照.gs' }
);

context.setupSheets = () => {};
context.verifyLineUser_ = () => ({ sub: 'U_TEST', name: 'Tester' });
context.consumeRouteValidationToken_ = () => true;
context.makeRouteValidationFingerprint_ = (userId, data) => userId + '|' + JSON.stringify(data);
context.makeRouteValidationSignature_ = (issuedAt, fingerprint, nonce) =>
  crypto.createHash('sha256').update([issuedAt, fingerprint, nonce].join('|')).digest('hex');
context.openRouteqQaTestSpreadsheet_ = () => ({
  getSheetByName(name) {
    if (name === 'Users') return users;
    if (name === 'Questions') return questions;
    throw new Error('unexpected sheet: ' + name);
  }
});
context.findRouteUserRow_ = () => 2;
context.generateAiDraft_ = () => 'mock draft';
context.autoSendRouteAnswerIfEnabled_ = () => {};

const baseParams = {
  idToken: 'mock-id-token', category: 'school', categoryLabel: '学校',
  theme: '特徴', district: 'test', districtLabel: 'TEST', school: 'TEST高校',
  question: '質問です', questionSource: 'manual'
};
const tokenA = '1.submission-a.' + 'a'.repeat(64);
const tokenB = '2.submission-b.' + 'b'.repeat(64);

const issuedOne = context.saveRouteValidationToken_('U_TEST', baseParams);
const issuedTwo = context.saveRouteValidationToken_('U_TEST', baseParams);
assert.equal(issuedOne.split('.').length, 3);
assert.equal(issuedTwo.split('.').length, 3);
assert.notEqual(issuedOne, issuedTwo);

resetState();
const first = context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenA });
const replay = context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenA });
assert.equal(first.questionRow, 2);
assert.equal(replay.questionRow, 2);
assert.equal(questionWrites, 1);
assert.equal(userValues[6], 1);
assert.equal(userValues[7], 2);
assert.equal(Array.from(questionRows[0].slice(17, 22)).join('|'), '||||');
assert.equal(questionRows[0][22], tokenA);

propertyData.delete(context.getRouteQuestionSubmissionKey_(tokenA));
const replayFromSheet = context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenA });
assert.equal(replayFromSheet.questionRow, 2);
assert.equal(replayFromSheet.alreadyAccepted, true);
assert.equal(questionWrites, 1);

const intentionalSecond = context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenB });
assert.equal(intentionalSecond.questionRow, 3);
assert.equal(questionWrites, 2);
assert.equal(userValues[6], 2);
assert.throws(
  () => context.saveQuestionForWeb_({ ...baseParams, question: '改ざんされた別内容', validationToken: tokenA }),
  /質問送信ID(?:と|の)内容が一致しません/
);

resetState();
failNextUserWrite = true;
assert.throws(
  () => context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenA }),
  /injected Users write failure/
);
assert.equal(questionRows.length, 0);
const retryAfterRollback = context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenA });
assert.equal(retryAfterRollback.questionRow, 2);
assert.equal(userValues[6], 1);

resetState();
failNextUserWrite = true;
failQuestionDelete = true;
assert.throws(
  () => context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenA }),
  /手動整合確認が必要/
);
assert.equal(questionRows.length, 1);
assert.throws(
  () => context.saveQuestionForWeb_({ ...baseParams, validationToken: tokenA }),
  /整合確認が必要/
);
assert.equal(questionWrites, 1);

console.log('Question submission idempotency: 23/23 PASS');
