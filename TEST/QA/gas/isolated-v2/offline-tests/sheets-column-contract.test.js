const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', '訂正シート最優先・直接参照.gs'), 'utf8');
const block = src.match(/QUESTION_COL:\s*\{([\s\S]*?)\n\s*\},/);
assert.ok(block, 'question column mapping missing');
const found = Object.fromEntries([...block[1].matchAll(/([A-Z_]+):\s*(\d+)/g)].map(m => [m[1], Number(m[2])]));
const expected = {
  RECEIVED_AT:1, LINE_USER_ID:2, DISPLAY_NAME:3, CATEGORY:4, THEME:5,
  DISTRICT:6, SCHOOL:7, QUESTION:8, AI_ANSWER:9, FINAL_ANSWER:10,
  AI_STATUS:11, CONFIRMED:12, SEND_STATUS:13, SENT_AT:14, UPDATED_AT:15,
  TICKET_LABEL:16, REMAINING_AFTER:17, CORRECTED_ANSWER:18,
  CORRECTION_REASON:19, COMMON_RULE_CANDIDATE:20, RULE_DRAFT:21,
  RULE_APPROVAL:22, SUBMISSION_ID:23
};
assert.deepEqual(found, expected);
assert.match(src, /'訂正後回答',\s*'訂正理由',\s*'共通ルール候補',\s*'ルール案',\s*'ルール承認',\s*'質問送信ID'/);
assert.match(src, /'Stripe Session ID',\s*'Payment Intent ID',\s*'決済状態',\s*'回数付与済み',\s*'付与日時',\s*'最終更新日時',\s*'付与復旧ジャーナル'/);
console.log('Isolated Sheets column contract: 25/25 PASS; no external operations');
