const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const scripts = fs.readdirSync(root).filter(name => name.endsWith('.gs'));
const controlled = '05_test_request_control.gs';
const offlineModels = ['06_offline_journal_planner.gs', '06_offline_replay_decision.gs'];
for (const file of offlineModels) assert.ok(scripts.includes(file), 'offline model missing: ' + file);
assert.ok(scripts.includes(controlled), 'offline prototype missing');
let checked = 0;
for (const name of scripts) {
  if (name === controlled || offlineModels.includes(name)) continue;
  const content = fs.readFileSync(path.join(root, name), 'utf8');
  assert.ok(!/\brouteqQaPrepareOfflineTestRequest_\s*\(/.test(content),
    'offline simulation wired into real GAS module: ' + name);
  for (const identifier of ['routeqQaPlanOfflineJournalTransition_', 'routeqQaDecideOfflineTransition_']) {
    assert.ok(!content.includes(identifier + '('), 'offline decision wired into executable module: ' + name);
  }
  checked++;
}
const prototype = fs.readFileSync(path.join(root, controlled), 'utf8');
assert.match(prototype, /executionAuthorized:\s*false/);
assert.match(prototype, /externalExecutionPermitted:\s*false/);
assert.doesNotMatch(prototype, /\bUrlFetchApp\s*\./);
console.log('B-03A offline prototype isolation: ' + (checked + 3) + '/' + (checked + 3) + ' PASS; production entry wiring: 0');
