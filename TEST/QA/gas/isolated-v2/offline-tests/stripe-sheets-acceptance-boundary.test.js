const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const stripe = fs.readFileSync(path.join(__dirname, '..', 'Stripe連携.gs'), 'utf8');
const acceptance = fs.readFileSync(
  path.join(__dirname, '..', '11_stripe_grant_sheets_acceptance.gs'),
  'utf8'
);

assert.match(stripe, /permit === ROUTEQ_QA_STRIPE_GRANT_ACCEPTANCE_PERMIT_/);
assert.match(stripe, /routeqQaBlockSensitiveEntry_\('applyPaidStripeSession_'\)/);
assert.match(acceptance, /livemode:\s*false/);
assert.match(acceptance, /externalStripeRequests:\s*0/);
assert.doesNotMatch(acceptance, /UrlFetchApp\s*\./);
assert.doesNotMatch(acceptance, /api\.stripe\.com/);
assert.match(acceptance, /second\.alreadyGranted !== true/);
assert.match(acceptance, /firstRemaining !== secondRemaining/);

console.log('Stripe Sheets acceptance boundary: 8/8 PASS');
