const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const core = fs.readFileSync(
  path.join(__dirname, '..', '訂正シート最優先・直接参照.gs'),
  'utf8'
);
const acceptance = fs.readFileSync(
  path.join(__dirname, '..', '12_question_sheets_acceptance.gs'),
  'utf8'
);

assert.match(core, /typeof ROUTEQ_QA_QUESTION_ACCEPTANCE_PERMIT_ !== 'undefined'/);
assert.match(core, /acceptancePermit === ROUTEQ_QA_QUESTION_ACCEPTANCE_PERMIT_/);
assert.match(core, /!ownerAcceptance &&\s*!consumeRouteValidationToken_/);
assert.match(core, /ownerAcceptance\s*\? '【隔離TEST固定回答】/);
assert.match(acceptance, /replayConsumedAdditionalTicket:\s*false/);
assert.match(acceptance, /realAiInvoked:\s*false/);
assert.match(acceptance, /lineRealSendExecuted:\s*false/);
assert.doesNotMatch(acceptance, /UrlFetchApp\s*\./);

console.log('Question Sheets acceptance boundary: 8/8 PASS');
