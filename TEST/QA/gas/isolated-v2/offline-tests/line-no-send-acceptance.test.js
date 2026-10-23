'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const columns = ['受付日時','LINEユーザーID','表示名','大項目','質問テーマ','学区','高校名','質問内容','AI回答案','最終回答','AI生成状態','確認済み','送信状態','LINE送信日時','最終更新日時','利用チケット','質問後残り回数','訂正後回答','訂正理由','共通ルール候補','ルール案','ルール承認','質問送信ID'];
const q = Array(23).fill('');
q[1] = 'U_ROUTEQ_USER_123';
q[7] = '隔離テスト質問';
q[9] = '経営者が確認した模擬回答';
q[11] = '確認済';
q[22] = 'question-id-test-001';
let networkCalls = 0;
let sheetWrites = 0;
const properties = new Map([
  ['ROUTEQ_QA_ENVIRONMENT','ISOLATED_TEST'],
  ['ROUTEQ_QA_SHEET_ID','11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8'],
  ['ROUTEQ_QA_EXTERNAL_SEND','DISABLED'],
  ['ROUTEQ_QA_LIVE_PAYMENT','DISABLED']
]);
let sheetId = '11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';
let scriptId = '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
let questionRows = [columns, q];
let userRows = [['LINEユーザーID'], ['U_ROUTEQ_USER_123']];
function makeSheet(rows) {
  return {
    getLastRow() { return rows.length; },
    getRange(r,c,count=1,width=1) {
      return {
        getValue() { return rows[r-1]?.[c-1] ?? ''; },
        getValues() {
          return Array.from({length:count}, (_,i) =>
            Array.from({length:width},(_,j)=>rows[r+i-1]?.[c+j-1] ?? ''));
        },
        setValue(){sheetWrites++;throw Error('Write forbidden');},
        setValues(){sheetWrites++;throw Error('Write forbidden');}
      };
    }
  };
}
const spreadsheet = {
  getId() { return sheetId; },
  getSheetByName(name) {
    if (name === 'Questions') return makeSheet(questionRows);
    if (name === 'Users') return makeSheet(userRows);
    return null;
  }
};
const context={
  ScriptApp:{getScriptId(){return scriptId;}},
  PropertiesService:{getScriptProperties(){return {getProperty(k){return properties.get(k) ?? null;}};}},
  SpreadsheetApp:{openById(id){assert.equal(id,sheetId);return spreadsheet;}},
  UrlFetchApp:{fetch(){networkCalls++;throw Error('LINE external transport forbidden');}}
};
vm.createContext(context);
for (const file of ['00_isolation_guard.gs','08_line_no_send_acceptance.gs']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
}
const check=()=>context.routeqQaInspectLineNoSend_(2,'U_ROUTEQ_USER_123');
assert.equal(check().result,'MOCK_VALIDATED_NOT_SENT');
assert.equal(check().markedAsSent,false);
assert.equal(check().networkRequests,0);
assert.equal(check().additionalApiChargeYen,0);
function expectReject(action, code) {
  assert.throws(action,new RegExp(code));
  assert.equal(networkCalls,0);
  assert.equal(sheetWrites,0);
}
expectReject(()=>context.routeqQaInspectLineNoSend_(2,'U_ATTACKER_999'),'LINE_MOCK_RECIPIENT_MISMATCH');
expectReject(()=>context.routeqQaInspectLineNoSend_(2,'U_ROUTEQ_USER_123 '),'LINE_MOCK_INVALID_REQUEST');
expectReject(()=>context.routeqQaInspectLineNoSend_(1,'U_ROUTEQ_USER_123'),'LINE_MOCK_INVALID_REQUEST');
expectReject(()=>context.routeqQaInspectLineNoSend_(3,'U_ROUTEQ_USER_123'),'LINE_MOCK_QUESTION_MISSING');
q[1] = ''; expectReject(check,'LINE_MOCK_RECIPIENT_MISMATCH');q[1]='U_ROUTEQ_USER_123';
q[9] = ''; expectReject(check,'LINE_MOCK_ANSWER_NOT_APPROVED');q[9]='approved';
q[11]='未確認';expectReject(check,'LINE_MOCK_ANSWER_NOT_APPROVED');q[11]='確認済';
for(const state of ['送信済','送信結果不明','送信処理中','重複送信防止','送信準備中']){
  q[12]=state;expectReject(check,'LINE_MOCK_ALREADY_ATTEMPTED');
}
q[12]='';
q[22]='';expectReject(check,'LINE_MOCK_SUBMISSION_ID_INVALID');q[22]='question-id-test-001';
q[22]='1761217200000.routeq-qa-isolated-acceptance.a7c9e2b41d86f5039a8c728f8ab2e60b9c96f0cdd52703d7fd56cdf918594a31';
assert.equal(check().result,'MOCK_VALIDATED_NOT_SENT');
for (const invalidId of ['.bad', 'bad.', 'bad..double']) {
  q[22]=invalidId;
  expectReject(check,'LINE_MOCK_SUBMISSION_ID_INVALID');
}
q[22]='question-id-test-001';
questionRows.push([...q]);expectReject(check,'LINE_MOCK_DUPLICATE_QUESTION_ID');questionRows.pop();
userRows.push(['U_ROUTEQ_USER_123']);expectReject(check,'LINE_MOCK_USER_NOT_UNIQUE');userRows.pop();
userRows.pop();expectReject(check,'LINE_MOCK_USER_MISSING');userRows.push(['U_ROUTEQ_USER_123']);
columns[22]='旧ID';expectReject(check,'LINE_MOCK_COLUMN_MISMATCH');columns[22]='質問送信ID';
userRows[0][0]='old_user';expectReject(check,'LINE_MOCK_USER_COLUMN_MISMATCH');userRows[0][0]='LINEユーザーID';
properties.set('ROUTEQ_QA_EXTERNAL_SEND','ENABLED');
expectReject(check,'external send must remain DISABLED');
properties.set('ROUTEQ_QA_EXTERNAL_SEND','DISABLED');
scriptId='wrong_script';expectReject(check,'unexpected Apps Script project ID');
scriptId='1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
assert.equal(check().result,'MOCK_VALIDATED_NOT_SENT');
assert.equal(networkCalls,0);assert.equal(sheetWrites,0);
console.log('LINE read-only dry-run acceptance: PASS; network=0; sheetWrites=0; paid API=0');
