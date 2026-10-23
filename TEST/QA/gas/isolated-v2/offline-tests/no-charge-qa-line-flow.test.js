'use strict';
// No network, no OpenAI expense and no LINE delivery: end-to-end fixture stages.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const columns=['受付日時','LINEユーザーID','表示名','大項目','質問テーマ','学区','高校名','質問内容','AI回答案','最終回答','AI生成状態','確認済み','送信状態','LINE送信日時','最終更新日時','利用チケット','質問後残り回数','訂正後回答','訂正理由','共通ルール候補','ルール案','ルール承認','質問送信ID'];
const q=Array(23).fill('');
q[1]='U_ROUTEQ_USER_123';q[7]='受験に関する模擬質問';q[22]='question-id-test-001';
const rows=[columns,q],users=[['LINEユーザーID'],['U_ROUTEQ_USER_123']];
let reads=0,writes=0,requests=0;
function sheet(data){return {getLastRow(){return data.length;},getRange(r,c,n=1,m=1){reads++;return {getValue(){return data[r-1]?.[c-1]??'';},getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r+i-1]?.[c+j-1]??''));},setValue(){writes++;throw Error('write forbidden');},setValues(){writes++;throw Error('write forbidden');}};}};}
const props=new Map([
['ROUTEQ_QA_ENVIRONMENT','ISOLATED_TEST'],['ROUTEQ_QA_SHEET_ID','11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8'],
['ROUTEQ_QA_EXTERNAL_SEND','DISABLED'],['ROUTEQ_QA_LIVE_PAYMENT','DISABLED']]);
const context={
ScriptApp:{getScriptId(){return '1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';}},
PropertiesService:{getScriptProperties(){return {getProperty(k){return props.get(k)??null;}};}},
SpreadsheetApp:{openById(id){assert.equal(id,'11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8');return {getId(){return id;},getSheetByName(name){return name==='Questions'?sheet(rows):name==='Users'?sheet(users):null;}};}},
UrlFetchApp:{fetch(){requests++;throw Error('external call forbidden');}}
};
vm.createContext(context);
for(const f of ['00_isolation_guard.gs','08_line_no_send_acceptance.gs','09_ai_zero_charge_mock.gs']){
vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),context,{filename:f});
}
function ai(){return context.routeqQaSimulateAiWithoutApi_(2);}
function line(){return context.routeqQaInspectLineNoSend_(2,'U_ROUTEQ_USER_123');}
const draft=ai();
assert.equal(draft.result,'MOCK_DRAFT_NOT_SAVED');
assert.equal(draft.realAiModelInvoked,false);
assert.equal(draft.additionalApiChargeYen,0);
assert.equal(draft.lineDeliveryAllowed,false);
assert.match(draft.draft,/隔離TEST・AI回答模擬文/);
assert.throws(line,/LINE_MOCK_ANSWER_NOT_APPROVED/);
q[8]=draft.draft;
assert.throws(ai,/AI_MOCK_ANSWER_ALREADY_EXISTS/);
// Emulate the distinct human approval stage with a TEST fixture only,
// without saving an unapproved AI draft as the answer.
q[8]='';q[9]='確認済みの模擬最終回答';q[11]='確認済';
assert.equal(line().result,'MOCK_VALIDATED_NOT_SENT');
assert.equal(q[12],'');
assert.throws(ai,/AI_MOCK_ANSWER_ALREADY_EXISTS/);
q[9]='';q[11]='';
q[7]='';assert.throws(ai,/AI_MOCK_QUESTION_INCOMPLETE/);q[7]='受験に関する模擬質問';
q[22]='';assert.throws(ai,/AI_MOCK_QUESTION_INCOMPLETE/);q[22]='question-id-test-001';
rows[0][8]='旧AI列';assert.throws(ai,/AI_MOCK_COLUMN_MISMATCH/);rows[0][8]='AI回答案';
props.set('ROUTEQ_QA_EXTERNAL_SEND','ENABLED');
assert.throws(ai,/external send must remain DISABLED/);
props.set('ROUTEQ_QA_EXTERNAL_SEND','DISABLED');
assert.equal(ai().result,'MOCK_DRAFT_NOT_SAVED');
assert.ok(reads>0);
assert.equal(writes,0);assert.equal(requests,0);
console.log('Zero-charge QA/AI mock to approved LINE no-send flow: PASS; writes=0; requests=0; paid API=0');
