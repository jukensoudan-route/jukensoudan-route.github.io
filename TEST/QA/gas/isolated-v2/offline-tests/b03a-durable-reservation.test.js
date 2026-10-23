'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=['00_isolation_guard.gs','03_isolated_v2_stops.gs','07_durable_test_reservation.gs']
 .map(n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8')).join('\n');
const scriptId='1XFmCxARSHiYd3Hy1F7AvhbWQmPtz3TrbUr_nZDRXYZ11U8HMqTMMd8GQ';
const sheetId='11pWeP_LKbL7tAVAn6DBWvhqRo_1l0rIHHBdLjjx7lz8';
const features=['stripe_test','ai','line_manual_test'];
const gates=['ROUTEQ_QA_TEST_ALLOW_STRIPE','ROUTEQ_QA_TEST_ALLOW_AI','ROUTEQ_QA_TEST_ALLOW_LINE_MANUAL'];
let cases=0,network=0;
function check(fn){fn();cases++;}
function fixture(){
 const map=new Map([['ROUTEQ_QA_ENVIRONMENT','ISOLATED_TEST'],
 ['ROUTEQ_QA_SHEET_ID',sheetId],['ROUTEQ_QA_EXTERNAL_SEND','DISABLED'],
 ['ROUTEQ_QA_LIVE_PAYMENT','DISABLED'],...gates.map(k=>[k,'ON'])]);
 const state={now:100000,scriptId,held:false,writes:0,fail:false,misread:false,unread:false,hook:null};
 const forbidden=()=>{network++;throw Error('NETWORK_FORBIDDEN');};
 const props={getProperty:k=>{
   if(state.misread&&state.unread){state.unread=false;return null;}
   return map.has(k)?map.get(k):null;
 },setProperty:(k,v)=>{
   if(state.fail)throw Error('INJECT_WRITE_FAILURE');
   state.writes++;map.set(k,v);if(state.misread)state.unread=true;
   if(state.hook)state.hook();
 },deleteProperty:forbidden};
 const lock={tryLock:()=>{if(state.held)return false;state.held=true;return true;},
 releaseLock:()=>{state.held=false;}};
 function open(){
   const ctx=vm.createContext({
     Date:{now:()=>state.now},ScriptApp:{getScriptId:()=>state.scriptId},
     PropertiesService:{getScriptProperties:()=>props},
     LockService:{getScriptLock:()=>lock},
     UrlFetchApp:{fetch:forbidden,fetchAll:forbidden},
     DriveApp:new Proxy({},{get:forbidden}),
     SpreadsheetApp:new Proxy({},{get:forbidden})
   });vm.runInContext(source,ctx);return ctx;
 }
 const ctx=open();
 return {map,state,open,ctx,request:(feature='stripe_test')=>({
 id:'qa-b03a-durable-0001',feature,fingerprint:'a'.repeat(64),
 approved:true,approvedAt:100000,expiresAt:101000}),
 reserve:r=>ctx.routeqQaReserveDurableTestRequest_(r),
 begin:r=>ctx.routeqQaMarkDurableTestAttempt_(r)};
}
for(const feature of features)check(()=>{
 const f=fixture(),r=f.request(feature);
 let v=f.reserve(r);assert.equal(v.action,'RESERVE_ONLY');
 assert.equal(v.externalExecutionPermitted,false);assert.equal(v.executionAuthorized,false);
 assert.equal(v.retryAllowed,false);assert.equal(v.networkRequests,0);
 assert.equal(Object.isFrozen(v),true);
 assert.equal(f.reserve(r).action,'BLOCK_REPLAY');
 v=f.begin(r);assert.equal(v.state,'UNKNOWN');
 assert.equal(v.action,'ATTEMPT_CONSUMED_NO_TRANSPORT');
 assert.equal(f.begin(r).action,'BLOCK_REPLAY');
 assert.equal(f.reserve(r).state,'UNKNOWN');
 assert.equal(f.state.held,false);
});
check(()=>{const f=fixture(),r=f.request(),second=f.open();
 f.reserve(r);
 assert.equal(second.routeqQaReserveDurableTestRequest_(r).action,'BLOCK_REPLAY');
 assert.equal(second.routeqQaMarkDurableTestAttempt_(r).state,'UNKNOWN');
 assert.equal(f.begin(r).state,'UNKNOWN');
});
check(()=>{const f=fixture(),r=f.request();
 assert.throws(()=>f.begin(r),/RESERVATION_MISSING/);
 f.reserve(r);
 for(const bad of [{...r,feature:'ai'},{...r,fingerprint:'b'.repeat(64)},
 {...r,expiresAt:r.expiresAt-1},{...r,approvedAt:r.approvedAt+1}])
 assert.throws(()=>f.reserve(bad),/CONFLICT/);
});
for(const change of [
 r=>({...r,id:'bad'}),r=>({...r,feature:'bad'}),
 r=>({...r,fingerprint:'invalid'}),r=>({...r,approved:false}),
 r=>({...r,approvedAt:-1}),r=>({...r,expiresAt:100000}),
 r=>({...r,expiresAt:160001}),r=>({...r,payload:'secret'}),
 r=>({...r,token:'secret'}),r=>({...r,url:'https://api.line.me'}),
 r=>({...r,retry:true})
])check(()=>{const f=fixture();
 assert.throws(()=>f.reserve(change(f.request())),/INVALID_REQUEST/);
 assert.equal(f.state.writes,0);
});
check(()=>{const f=fixture(),r=f.request();
 Object.defineProperty(r,'approved',{enumerable:true,get:()=>true});
 assert.throws(()=>f.reserve(r),/INVALID_REQUEST/);
});
check(()=>{const f=fixture(),r=f.request();
 Object.defineProperty(r,'secret',{value:'x',enumerable:false});
 assert.throws(()=>f.reserve(r),/INVALID_REQUEST/);
});
check(()=>{const f=fixture(),r=f.request();
 r[Symbol('credential')]='x';assert.throws(()=>f.reserve(r),/INVALID_REQUEST/);
});
for(let i=0;i<features.length;i++)check(()=>{
 const f=fixture(),r=f.request(features[i]);f.map.set(gates[i],'OFF');
 assert.throws(()=>f.reserve(r),/GATE_OFF/);assert.equal(f.state.writes,0);
 f.map.set(gates[i],'ON');f.reserve(r);
 f.map.set(gates[i],'OFF');assert.throws(()=>f.begin(r),/GATE_OFF/);
 assert.equal(JSON.parse(f.map.get('ROUTEQ_QA_B03A_RESERVATION_V1_'+r.id)).state,'RESERVED');
});
for(const bad of [
 f=>{f.state.scriptId='production';},
 f=>{f.map.set('ROUTEQ_QA_SHEET_ID','production');},
 f=>{f.map.set('ROUTEQ_QA_ENVIRONMENT','PROD');},
 f=>{f.map.set('ROUTEQ_QA_EXTERNAL_SEND','ENABLED');},
 f=>{f.map.set('ROUTEQ_QA_LIVE_PAYMENT','ENABLED');}
])check(()=>{const f=fixture();bad(f);
 assert.throws(()=>f.reserve(f.request()));assert.equal(f.state.writes,0);
});
check(()=>{const f=fixture();f.state.held=true;
 assert.throws(()=>f.reserve(f.request()),/LOCK_UNAVAILABLE/);
 assert.equal(f.state.writes,0);
});
check(()=>{const f=fixture();f.state.fail=true;
 assert.throws(()=>f.reserve(f.request()),/INJECT_WRITE_FAILURE/);
 assert.equal(f.state.held,false);
});
check(()=>{const f=fixture(),r=f.request();f.state.misread=true;
 assert.throws(()=>f.reserve(r),/NOT_DURABLE/);
 f.state.misread=false;
 assert.equal(f.reserve(r).action,'BLOCK_REPLAY');
});
check(()=>{const f=fixture(),r=f.request();f.reserve(r);f.state.misread=true;
 assert.throws(()=>f.begin(r),/NOT_DURABLE/);
 f.state.misread=false;
 assert.equal(f.begin(r).state,'UNKNOWN');
});
check(()=>{const f=fixture(),r=f.request();f.state.now=101000;
 assert.throws(()=>f.reserve(r),/APPROVAL_EXPIRED/);
 assert.equal(f.state.writes,0);
});
check(()=>{const f=fixture(),r=f.request();f.reserve(r);f.state.now=101000;
 assert.throws(()=>f.begin(r),/APPROVAL_EXPIRED/);
 assert.equal(JSON.parse(f.map.get('ROUTEQ_QA_B03A_RESERVATION_V1_'+r.id)).state,'RESERVED');
});
check(()=>{const f=fixture(),r=f.request();f.reserve(r);
 f.map.set('ROUTEQ_QA_B03A_RESERVATION_V1_'+r.id,'{invalid');
 assert.throws(()=>f.reserve(r),/CORRUPT/);
});
check(()=>{const f=fixture(),r=f.request(),other=f.open();
 f.state.hook=()=>{
   f.state.hook=null;
   assert.throws(()=>other.routeqQaReserveDurableTestRequest_(r),/LOCK_UNAVAILABLE/);
 };
 f.reserve(r);assert.equal(other.routeqQaReserveDurableTestRequest_(r).action,'BLOCK_REPLAY');
});
assert.equal(network,0,'unexpected external call');
console.log('B-03A durable TEST journal: '+cases+'/'+cases+' PASS; network calls: '+network);
