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
assert.match(sender, /routeqLinePrepareIntent_\(\{/,
  'send entrypoint must durably prepare intent before transport');
assert.match(sender, /routeqLineMarkInProgress_\(/,
  'send entrypoint must mark the shared intent in progress');
assert.ok(sender.indexOf('routeqLinePrepareIntent_') < sender.indexOf('routeqQaRejectExternalFetch_'),
  'intent must be persisted before the transport attempt');
assert.match(sender, /routeqLineSetOutcome_\([\s\S]*?true[\s\S]*?\)/,
  'accepted transport must be journaled');
assert.match(sender, /catch\s*\(error\)[\s\S]*?routeqLineSetOutcome_\([\s\S]*?false[\s\S]*?\)/,
  'transport or acceptance-record failure must remain UNKNOWN');
// The following are mandatory pre-release invariants.
// They intentionally expose today's failures until source is repaired.
const keyManual = manual.match(/sendLinePushMessage_\(\s*lineUserId,\s*answer,\s*'([^']+)'\s*\+\s*row/s);
const keyDelayed = delayed.match(/sendLinePushMessage_\(\s*lineUserId,\s*draft,\s*'([^']+)'\s*\+\s*row/s);
assert.ok(keyManual && keyDelayed, 'manual/delayed send call missing');
assert.equal(keyManual[1], keyDelayed[1],
  'manual and delayed LINE dedupe key namespace differs');
// HTTP 409 is expected for an already accepted identical request; it is not a failure.
assert.match(sender, /status\s*===\s*409/, 'LINE 409 duplicate handling missing');
// The actual problem is the non-canonical dedupe key across send paths.
const keyBuilder = bodyAfter(service, 'buildRouteLineRetryKey_');
assert.match(keyBuilder, /dedupeKey/, 'send identity input missing');
const manualSend = bodyAfter(manual, 'sendCurrentAnswerToLine');
assert.match(manualSend, /const\s+sent\s*=\s*sendLinePushMessage_\(/,
  'manual delivery must inspect send result');
assert.match(manualSend, /if\s*\(\s*!sent\s*\)/,
  'manual delivery must not mark unsent result as delivered');
// Uncertain outcomes must never be retried automatically or marked as sent.
const manualSendBody = bodyAfter(manual, 'sendCurrentAnswerToLine');
const delayedSendBody = bodyAfter(delayed, 'processOneRouteDelayedReply_');
for (const [name, sendBody] of [['manual', manualSendBody], ['delayed', delayedSendBody]]) {
  assert.match(sendBody, /sendStatus\s*===\s*'送信結果不明'/,
    name + ': UNKNOWN send must block later attempts');
  assert.match(sendBody, /sendStatus\s*===\s*'送信処理中'/,
    name + ': IN_PROGRESS must block later attempts');
  assert.match(sendBody, /catch\s*\(error\)[\s\S]*?\\.setValue\(\s*'送信結果不明'/,
    name + ': delivery exception must be treated as UNKNOWN');
}
assert.match(manualSendBody, /catch\s*\(uiError\)/,
  'post-acceptance UI refresh failure must be isolated');
assert.match(delayedSendBody, /recoveryHold\s*=\s*true/,
  'interrupted delayed delivery must retain a recovery hold');
assert.match(delayedSendBody, /props\.setProperty\(propertyKey,\s*JSON\.stringify\(item\)\)/,
  'interrupted delayed delivery must preserve its journal');
console.log('LINE delivery regression gate: PASS; UI-refresh failure isolated; delayed interruption held; no outbound requests');
