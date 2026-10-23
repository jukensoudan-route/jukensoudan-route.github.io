const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({});
vm.runInContext([
  '06_offline_replay_decision.gs',
  '06_offline_journal_planner.gs'
].map(name => fs.readFileSync(path.join(root, name), 'utf8')).join('\n'), context);

const decide = context.routeqQaDecideOfflineTransition_;
const plan = context.routeqQaPlanOfflineJournalTransition_;
const base = {
  id: 'qa-consistency-request-001',
  feature: 'stripe_test',
  fingerprint: 'c'.repeat(64),
  approved: true,
  approvedAt: 1000,
  expiresAt: 61000
};
let passed = 0;
const check = fn => { fn(); passed++; };

for (const feature of ['stripe_test', 'ai', 'line_manual_test']) {
  const request = {...base, feature};
  for (const now of [1000, 60999]) check(() => {
    const decision = decide(request, null, now);
    const journal = plan(null, request, now);
    assert.equal(decision.decision, 'RESERVE_ONLY');
    assert.equal(journal.action, 'RESERVE_ONLY');
    assert.equal(decision.id, journal.id);
    assert.equal(decision.feature, journal.feature);
    assert.equal(decision.fingerprint, journal.fingerprint);
    assert.equal(decision.approvedAt, journal.approvedAt);
    assert.equal(decision.expiresAt, journal.expiresAt);
    assert.equal(decision.executionAuthorized, false);
    assert.equal(journal.executionAuthorized, false);
    assert.equal(decision.externalExecutionPermitted, false);
    assert.equal(journal.externalExecutionPermitted, false);
    assert.equal(decision.retryAllowed, false);
    assert.equal(journal.retryAllowed, false);
    assert.equal(decision.networkRequests, 0);
    assert.equal(journal.networkRequests, 0);
  });
  for (const now of [999, 61000]) check(() => {
    assert.equal(decide(request, null, now).decision, 'STOP');
    assert.equal(plan(null, request, now).action, 'DENY_EXPIRED');
  });
  for (const state of ['RESERVED', 'UNKNOWN']) check(() => {
    const current = {id:request.id, feature, fingerprint:request.fingerprint,
      approvedAt:request.approvedAt, expiresAt:request.expiresAt, state};
    assert.equal(decide(request, current, 2000).decision, 'STOP');
    const journal = plan(current, request, 2000);
    assert.equal(journal.action, 'BLOCK_REPLAY');
    assert.equal(journal.externalExecutionPermitted, false);
    assert.equal(journal.retryAllowed, false);
  });
}

for (const approved of [false, undefined, 'true', 1]) check(() => {
  const request = {...base, approved};
  const decision = decide(request, null, 2000);
  const journal = plan(null, request, 2000);
  assert.equal(decision.reason, 'NOT_APPROVED');
  assert.equal(journal.action, 'DENY_NOT_APPROVED');
  assert.equal(decision.externalExecutionPermitted, false);
  assert.equal(journal.externalExecutionPermitted, false);
  assert.equal(decision.retryAllowed, false);
  assert.equal(journal.retryAllowed, false);
});

for (const mutate of [
  request => ({...request, id:'short'}),
  request => ({...request, feature:'unknown'}),
  request => ({...request, fingerprint:'unsafe'}),
  request => ({...request, approvedAt:1.5}),
  request => ({...request, expiresAt:1.5})
]) check(() => {
  const request = mutate(base);
  assert.equal(decide(request, null, 2000).decision, 'STOP');
  assert.throws(() => plan(null, request, 2000), /invalid request/);
});

check(() => {
  const request = {...base, approvedAt:-1, expiresAt:100};
  assert.equal(decide(request, null, 0).decision, 'STOP');
  assert.equal(plan(null, request, 0).action, 'DENY_EXPIRED');
});

console.log(`B-03A offline model consistency: ${passed}/${passed} PASS; external calls: 0`);
