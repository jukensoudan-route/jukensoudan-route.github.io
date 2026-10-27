const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'16_question_options_readonly.gs'),'utf8');
const guard = fs.readFileSync(path.join(__dirname,'isolation-guard.fixture.txt'),'utf8');
let rows, missing=false, environment='ISOLATED_TEST', sheetId='11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';
let scriptId='1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ', reads=0;
const header=['カテゴリキー','大項目','質問テーマ','質問内容','有効'];
const good=()=>[header,['test','架空TEST','テーマ','架空質問','TRUE']];
const props={ROUTEQ_QA_ENVIRONMENT:()=>environment,ROUTEQ_QA_SHEET_ID:()=>sheetId,
 ROUTEQ_QA_EXTERNAL_SEND:()=> 'DISABLED',ROUTEQ_QA_LIVE_PAYMENT:()=> 'DISABLED'};
const context={ScriptApp:{getScriptId:()=>scriptId},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]?.()})},
 SpreadsheetApp:{openById(id){assert.equal(id,sheetId);return {getId:()=>id,getSheetByName(name){
 assert.equal(name,'質問選択ツリー');return missing?null:{getLastRow:()=>rows.length,getRange(r,c,n,m){
 reads++;assert.deepEqual([r,c,n,m],[1,1,rows.length,5]);return {getDisplayValues:()=>rows};}};}};}},
 ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput(body){return {body,setMimeType(mime){return {body,mime};}};}}};
vm.createContext(context);vm.runInContext(guard+'\n'+source,context);
const call=(callback='cb')=>context.routeqQaQuestionOptions_({parameter:{action:'getQuestionOptions',callback}});
const parsed=(out)=>JSON.parse(out.mime==='js'?out.body.slice(3,-2):out.body);
let cases=0;function test(fn){fn();cases++;}
rows=good();test(()=>{let r=parsed(call());assert.equal(r.ok,true);assert.equal(r.categories[0].themes[0].questions[0],'架空質問');});
test(()=>assert.equal(parsed(call('')).ok,true));
test(()=>{let before=reads;assert.equal(parsed(call('x);evil(')).error,'INVALID_CALLBACK');assert.equal(reads,before);});
test(()=>{rows=[header];assert.equal(parsed(call()).error,'OPTIONS_EMPTY');});
test(()=>{rows=[['wrong'],...good().slice(1)];assert.equal(parsed(call()).error,'OPTIONS_SCHEMA_INVALID');});
test(()=>{missing=true;assert.equal(parsed(call()).error,'OPTIONS_SHEET_MISSING');missing=false;});
test(()=>{rows=[header,['test','x','t','','TRUE']];assert.equal(parsed(call()).error,'OPTIONS_ROW_INVALID');});
test(()=>{rows=[header,['test','x','t','q','FALSE']];assert.equal(parsed(call()).error,'OPTIONS_EMPTY');});
test(()=>{rows=[...good(),...good().slice(1)];assert.equal(parsed(call()).categories[0].themes[0].questions.length,1);});
test(()=>{rows=[...good(),['test','other','t','q','TRUE']];assert.equal(parsed(call()).error,'OPTIONS_ROW_INVALID');});
test(()=>{rows=[header,['__proto__','TEST','t','q','TRUE']];assert.equal(parsed(call()).categories[0].key,'__proto__');});
test(()=>{rows=[header,['test','TEST','t','</script>\u2028','TRUE']];assert.equal(call().body.includes('</script>'),false);});
test(()=>{rows=Array(2001).fill(header);assert.equal(parsed(call()).error,'OPTIONS_TOO_LARGE');});
rows=good();
test(()=>{environment='PRODUCTION';assert.throws(call);environment='ISOLATED_TEST';});
test(()=>{sheetId='production';assert.throws(call);sheetId='11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';});
test(()=>{scriptId='production';assert.throws(call);scriptId='1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';});
test(()=>assert.equal(parsed(context.routeqQaQuestionOptions_({parameter:{action:'other'}})).error,'UNSUPPORTED_ACTION'));
console.log(JSON.stringify({status:'PASS',cases,sheetWrites:0,externalRequests:0,scope:'offline mocks only'}));
