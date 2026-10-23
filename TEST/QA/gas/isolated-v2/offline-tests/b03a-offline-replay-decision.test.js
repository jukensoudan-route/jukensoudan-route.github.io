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
  assert.equal(actual.executionAuthorized,false); assert.equal(Object.isFrozen(actual),true); n++;
};
check(basic,null,100,'RESERVE_ONLY','OFFLINE_CANDIDATE');
check(basic,null,60099,'RESERVE_ONLY','OFFLINE_CANDIDATE');
for(const state of ['UNKNOWN','CONSUMED','SUCCEEDED','FAILED','RESERVED','ERROR']) {
  check(basic,{id:basic.id,feature:basic.feature,fingerprint:basic.fingerprint,state},200,'STOP',state==='UNKNOWN'?'UNKNOWN_NO_RETRY':state==='ERROR'?'INVALID_LEDGER_STATE':'ALREADY_USED');
}
check(basic,{id:'other',feature:basic.feature,fingerprint:basic.fingerprint,state:'UNKNOWN'},200,'STOP','LEDGER_MISMATCH');
check(basic,{id:basic.id,feature:'ai',fingerprint:basic.fingerprint,state:'RESERVED'},200,'STOP','LEDGER_MISMATCH');
check(basic,{id:basic.id,feature:basic.feature,fingerprint:'b'.repeat(64),state:'UNKNOWN'},200,'STOP','LEDGER_MISMATCH');
check(basic,null,60100,'STOP','EXPIRED');
check({...basic,approved:false},null,200,'STOP','NOT_APPROVED');
check({...basic,expiresAt:60101},null,200,'STOP','EXPIRED');
check({...basic,feature:'unknown'},null,200,'STOP','INVALID_FEATURE');
check({...basic,fingerprint:'unsafe'},null,200,'STOP','INVALID_FINGERPRINT');
check({...basic,id:'short'},null,200,'STOP','INVALID_ID');
check({...basic,approvedAt:400},null,200,'STOP','EXPIRED');
check(basic,null,50,'STOP','EXPIRED');
check(null,null,200,'STOP','INVALID_INPUT');
check(basic,null,Number.NaN,'STOP','INVALID_INPUT');
for(const feature of ['ai','line_manual_test'])
  check({...basic,feature},null,200,'RESERVE_ONLY','OFFLINE_CANDIDATE');
console.log('B-03A offline replay decisions: '+n+'/'+n+' PASS; external operations: 0');
