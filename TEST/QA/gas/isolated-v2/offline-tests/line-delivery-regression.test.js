'use strict';
// ROUTEQ LINE delivery regression gate.
// Offline-only: reads source as text; never opens Google Sheets or calls LINE.
// Intentionally fails on unresolved safety requirements. Not yet added to CI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manual = fs.readFileSync(path.join(root, '回答確認.gs'), 'utf8');
const delayed = fs.readFileSync(path.join(root, '回答モード切替.gs'), 'utf8');
const service = fs.readFileSync(path.join(root, '訂正シート最優先・直接参照.gs'), 'utf8');
function bodyAfter(source, functionName) {
  const start = source.indexOf('function ' + functionName + '(');
  assert.ok(start !== -1, functionName + ' not found');
  return source.slice(start, source.indexOf('\nfunction ', start + 10) === -1
    ? undefined : source.indexOf('\nfunction ', start + 10));
}
const sender = bodyAfter(service, 'sendLinePushMessage_');
assert.match(sender, /routeqQaBlockSensitiveEntry_\('sendLinePushMessage_'\)/,
  'external LINE send must stay blocked in isolated TEST');
assert.match(sender, /routeqQaRejectExternalFetch_\(/,
  'isolated TEST must never enable outbound LINE network');
// The following are mandatory pre-release invariants.
// They intentionally expose today's failures until source is repaired.
const keyManual = manual.match(/sendLinePushMessage_\(\s*lineUserId,\s*answer,\s*'([^']+)'\s*\+\s*row/s);
const keyDelayed = delayed.match(/sendLinePushMessage_\(\s*lineUserId,\s*draft,\s*'([^']+)'\s*\+\s*row/s);
assert.ok(keyManual && keyDelayed, 'manual/delayed send call missing');
assert.equal(keyManual[1], keyDelayed[1],
  'manual and delayed LINE dedupe key namespace differs');
assert.doesNotMatch(sender, /status\s*===\s*409[\s\S]*?return\s+true;/,
  '409 acceptance must be tied to persisted original request identity');
const manualSend = bodyAfter(manual, 'sendFinalAnswerToLine');
assert.match(manualSend, /const\s+sent\s*=\s*sendLinePushMessage_\(/,
  'manual delivery must inspect send result');
assert.match(manualSend, /if\s*\(\s*!sent\s*\)/,
  'manual delivery must not mark unsent result as delivered');
console.log('LINE delivery regression gate: PASS (no outbound requests)');
