'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname,'..','14_review_ui_safe_bootstrap.gs'),'utf8');
const fn = src.match(/function routeqQaSetupReviewTestOnly_\(\)\s*\{([\s\S]*)\}\s*$/);
assert.ok(fn,'isolated bootstrap entry exists');
assert.match(src,/assertRouteqQaTestEnvironment_\(\)/);
assert.match(src,/openRouteqQaTestSpreadsheet_\(\)/);
assert.match(src,/REVIEW_TEST_NOT_EMPTY/);
assert.match(src,/REVIEW_TEST_HEADER_MISMATCH/);
assert.match(src,/getRange\('A1:F52'\)\.getValues\(\)/);
assert.match(src,/if \(row === 0 && col === 0\) continue/);
assert.match(src,/setAllowInvalid\(false\)/);
for(const forbidden of [/\.clear\s*\(/,/\.clearContent\s*\(/,/\.breakApart\s*\(/,/\.deleteRows\s*\(/,/\.merge\s*\(/,/UrlFetchApp\s*\./,/sendLinePushMessage_\s*\(/,/ScriptApp\s*\.newTrigger\s*\(/]){
  assert.doesNotMatch(fn[1],forbidden);
}
assert.doesNotMatch(fn[1],/\.getSheetByName\('Users'\)/);
assert.doesNotMatch(fn[1],/\.getSheetByName\('Payments'\)/);
console.log('review UI safe bootstrap static contract PASS');
