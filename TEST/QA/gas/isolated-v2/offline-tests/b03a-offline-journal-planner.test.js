const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '06_offline_journal_planner.gs'), 'utf8'), context);
const plan = context.routeqQaPlanOfflineJournalTransition_;
const req = { id: 'qa-test-reservation-001', feature: 'stripe_test', fingerprint: 'a'.repeat(64), approved: true, approvedAt: 100000, expiresAt: 100500 };
let passed = 0;
const check = fn => { fn(); passed++; };
check(() => { const r = plan(null, req, 100000); assert.equal(r.action, 'RESERVE_ONLY'); assert.equal(r.feature, 'stripe_test'); assert.equal(r.approvedAt, 100000); assert.equal(r.expiresAt, 100500); assert.equal(r.executionAuthorized, false); assert.equal(r.retryAllowed, false); });
for (const state of ['RESERVED', 'UNKNOWN', 'COMPLETED', 'DENIED']) {
  check(() => { const r = plan({id:req.id, feature:req.feature, fingerprint:req.fingerprint, approvedAt:req.approvedAt, expiresAt:req.expiresAt, state}, req, 100000); assert.equal(r.action, 'BLOCK_REPLAY'); assert.equal(r.state, state); assert.equal(r.retryAllowed, false); });
}
const currentBase = {id:req.id,feature:req.feature,fingerprint:req.fingerprint,approvedAt:req.approvedAt,expiresAt:req.expiresAt,state:'RESERVED'};
check(() => assert.throws(() => plan({...currentBase,fingerprint:'b'.repeat(64)},req,100000),/conflict/));
check(() => assert.throws(() => plan({...currentBase,id:'other',state:'COMPLETED'},req,100000),/conflict/));
check(() => assert.throws(() => plan({...currentBase,feature:'ai',state:'UNKNOWN'},req,100000),/conflict/));
check(() => assert.throws(() => plan({...currentBase,approvedAt:99999},req,100000),/conflict/));
check(() => assert.throws(() => plan({...currentBase,expiresAt:100499},req,100000),/conflict/));
for (const approved of [false, undefined, 'true', 1]) check(() => {
  const r = plan(null,{...req,approved},100000);
  assert.equal(r.action,'DENY_NOT_APPROVED');
  assert.equal(r.retryAllowed,false);
});
for (const now of [99999,100500,100501,-1]) check(() => assert.equal(plan(null,req,now).action,'DENY_EXPIRED'));
for (const changed of [
  {...req, approvedAt:-1},
  {...req, approvedAt:100501},
  {...req, expiresAt:100000},
  {...req, expiresAt:160001}
]) check(() => assert.equal(plan(null,changed,100000).action,'DENY_EXPIRED'));
for (const feature of ['ai','line_manual_test']) check(() => assert.equal(plan(null,{...req,feature},100000).feature,feature));
for (const bad of [{...req,id:'x'},{...req,feature:'unknown'},{...req,fingerprint:'unsafe'}, {...req,approvedAt:1.5}, {...req,expiresAt:1.5}, null]) check(() => assert.throws(() => plan(null,bad,100000),/invalid request/));
check(() => assert.equal(Object.isFrozen(plan(null,req,100000)),true));
console.log('B-03A offline journal planner: ' + passed + '/' + passed + ' PASS; external calls: 0');
