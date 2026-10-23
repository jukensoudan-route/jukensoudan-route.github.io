'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','回答確認.gs'),'utf8');
const from=source.indexOf('function loadLatestUnconfirmedQuestion_(');
const to=source.indexOf('function openSelectedQuestionInReview()',from);
assert.ok(from>=0 && to>from);
const fn=source.slice(from,to);
const context={
  ROUTE_QA:{QUESTIONS:'Questions',QUESTION_COL:{QUESTION:8,AI_ANSWER:9,CONFIRMED:12}},
  openRouteqQaTestSpreadsheet_:null,
  SpreadsheetApp:{getActive(){return {toast(){throw Error('unexpected toast')}}}},
  loadQuestionToReview_:null
};
vm.createContext(context);
vm.runInContext(fn,context);
let entries=[],loaded=[],read=0;
context.openRouteqQaTestSpreadsheet_=()=>({getSheetByName:n=>n==='Questions'?{
  getLastRow:()=>entries.length+1,
  getRange(row,col,count,width){
    assert.equal(row,2);assert.equal(col,1);assert.equal(count,entries.length);assert.equal(width,17);
    read++;return {getValues:()=>entries};
  }
}:null});
context.loadQuestionToReview_=(row,activate)=>{loaded.push({row,activate})};
function row(question,ai,confirmed){const r=Array(17).fill('');r[7]=question;r[8]=ai;r[11]=confirmed;return r;}
function inspect(expected){
  loaded=[];context.loadLatestUnconfirmedQuestion_(false,false);
  if(expected===null){assert.equal(loaded.length,0);}
  else{assert.equal(loaded.length,1);assert.equal(loaded[0].row,expected);assert.equal(loaded[0].activate,false);}
}
entries=[row('TEST row2','', ''),row('TEST row3','', '確認済'),row('TEST row4','TEST fixed AI','確認済')];
inspect(4); // current isolated Sheets fixture
entries.push(row('TEST row5','TEST AI','未確認'));inspect(5); // prioritize latest unconfirmed
entries.push(row('TEST row6','TEST AI','確認済'));inspect(5); // still prefer unconfirmed
entries[3][11]='確認済';inspect(6); // fallback to latest with AI
entries=[row('TEST row2','', ''),row('TEST row3','', '確認済')];inspect(null); // no eligible
assert.equal(read,5);
assert.doesNotMatch(fn,/UrlFetchApp|sendLinePushMessage_|applyPaidStripeSession_/);
console.log('Review latest question routing mock PASS; no external send or payment');
