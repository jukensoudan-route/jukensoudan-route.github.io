const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '06_offline_replay_decision.gs'), 'utf8'), ctx);
const decide = (request, saved, now) => ctx.routeqQaDecideOfflineTransition_(request, saved, now);
const basic = { id: 'req_test_123456789abcdef', feature:'stripe_test', fingerprint:'a'.repeat(64), approved:true, approvedAt:100, expiresAt:60100 };
let n=0;
const check=(request,saved,now,decision,reason) => {
  const actual=decide(request,saved,now);
  assert.equal(actual.decision,decision); assert.equal(actual.reason,reason);
  assert.equal(actual.executionAuthorized,false);
  assert.equal(actual.externalExecutionPermitted,false);
  assert.equal(actual.retryAllowed,false);
  assert.equal(actual.networkRequests,0);
  assert.equal(Object.isFrozen(actual),true); n++;
};
check(basic,null,100,'RESERVE_ONLY','OFFLINE_CANDIDATE');
check(basic,null,60099,'RESERVE_ONLY','OFFLINE_CANDIDATE');
for(const state of ['UNKNOWN','CONSUMED','SUCCEEDED','FAILED','RESERVED','ERROR']) {
  check(basic,{id:basic.id,feature:basic.feature,fingerprint:basic.fingerprint,approvedAt:basic.approvedAt,expiresAt:basic.expiresAt,state},200,'STOP',state==='UNKNOWN'?'UNKNOWN_NO_RETRY':state==='ERROR'?'INVALID_LEDGER_STATE':'ALREADY_USED');
}
const savedBase={id:basic.id,feature:basic.feature,fingerprint:basic.fingerprint,approvedAt:basic.approvedAt,expiresAt:basic.expiresAt,state:'UNKNOWN'};
check(basic,{...savedBase,id:'other'},200,'STOP','LEDGER_MISMATCH');
check(basic,{...savedBase,feature:'ai',state:'RESERVED'},200,'STOP','LEDGER_MISMATCH');
check(basic,{...savedBase,fingerprint:'b'.repeat(64)},200,'STOP','LEDGER_MISMATCH');
check(basic,{...savedBase,approvedAt:101},200,'STOP','LEDGER_MISMATCH');
check(basic,{...savedBase,expiresAt:60099},200,'STOP','LEDGER_MISMATCH');
check(basic,null,60100,'STOP','EXPIRED');
check({...basic,approved:false},null,200,'STOP','NOT_APPROVED');
check({...basic,expiresAt:60101},null,200,'STOP','EXPIRED');
check({...basic,feature:'unknown'},null,200,'STOP','INVALID_FEATURE');
check({...basic,fingerprint:'unsafe'},null,200,'STOP','INVALID_FINGERPRINT');
check({...basic,id:'short'},null,200,'STOP','INVALID_ID');
check({...basic,approvedAt:400},null,200,'STOP','EXPIRED');
check({...basic,approvedAt:-1,expiresAt:100},null,0,'STOP','EXPIRED');
check(basic,null,50,'STOP','EXPIRED');
check(null,null,200,'STOP','INVALID_INPUT');
check(basic,null,Number.NaN,'STOP','INVALID_INPUT');
for(const extra of [
  {payload:'secret'}, {credentials:'secret'}, {url:'https://example.invalid'},
  {executor:function(){}}, {retry:true}
]) check({...basic,...extra},null,200,'STOP','INVALID_INPUT');
const accessorRequest={...basic};
Object.defineProperty(accessorRequest,'feature',{enumerable:true,get(){return 'stripe_test';}});
check(accessorRequest,null,200,'STOP','INVALID_INPUT');
const hiddenRequest={...basic};
Object.defineProperty(hiddenRequest,'payload',{enumerable:false,value:'secret'});
check(hiddenRequest,null,200,'STOP','INVALID_INPUT');
check(Object.assign({...basic},{[Symbol('payload')]:'secret'}),null,200,'STOP','INVALID_INPUT');
check(basic,{...savedBase,payload:'secret'},200,'STOP','LEDGER_MISMATCH');
const accessorSaved={...savedBase};
Object.defineProperty(accessorSaved,'state',{enumerable:true,get(){return 'UNKNOWN';}});
check(basic,accessorSaved,200,'STOP','LEDGER_MISMATCH');
const hiddenSaved={...savedBase};
Object.defineProperty(hiddenSaved,'credentials',{enumerable:false,value:'secret'});
check(basic,hiddenSaved,200,'STOP','LEDGER_MISMATCH');
for(const feature of ['ai','line_manual_test'])
  check({...basic,feature},null,200,'RESERVE_ONLY','OFFLINE_CANDIDATE');
console.log('B-03A offline replay decisions: '+n+'/'+n+' PASS; external operations: 0');
