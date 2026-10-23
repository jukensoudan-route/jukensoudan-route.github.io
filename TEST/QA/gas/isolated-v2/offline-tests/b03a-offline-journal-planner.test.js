const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '06_offline_journal_planner.gs'), 'utf8'), context);
const plan = context.routeqQaPlanOfflineJournalTransition_;
const req = { id: 'qa-test-reservation-001', fingerprint: 'a'.repeat(64), expiresAt: 100500 };
let passed = 0;
const check = fn => { fn(); passed++; };
check(() => { const r = plan(null, req, 100000); assert.equal(r.action, 'RESERVE_ONLY'); assert.equal(r.executionAuthorized, false); assert.equal(r.retryAllowed, false); });
for (const state of ['RESERVED', 'UNKNOWN', 'COMPLETED', 'DENIED']) {
  check(() => { const r = plan({id:req.id, fingerprint:req.fingerprint, state}, req, 100000); assert.equal(r.action, 'BLOCK_REPLAY'); assert.equal(r.retryAllowed, false); });
}
check(() => assert.throws(() => plan({id:req.id,fingerprint:'b'.repeat(64),state:'RESERVED'},req,100000),/conflict/));
check(() => assert.throws(() => plan({id:'other',fingerprint:req.fingerprint,state:'COMPLETED'},req,100000),/conflict/));
for (const now of [100500,100501,-1]) check(() => assert.equal(plan(null,req,now).action,'DENY_EXPIRED'));
check(() => assert.equal(plan(null,{...req,expiresAt:200000},100000).action,'DENY_EXPIRED'));
for (const bad of [{...req,id:'x'},{...req,fingerprint:'unsafe'}, {...req,expiresAt:1.5}, null]) check(() => assert.throws(() => plan(null,bad,100000),/invalid request/));
check(() => assert.equal(Object.isFrozen(plan(null,req,100000)),true));
console.log('B-03A offline journal planner: ' + passed + '/' + passed + ' PASS; external calls: 0');
