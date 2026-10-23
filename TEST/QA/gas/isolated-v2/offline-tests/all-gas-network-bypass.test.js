const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const scripts = fs.readdirSync(root).filter(name => name.endsWith('.gs'));
assert.ok(scripts.length >= 16, 'missing GAS source file in isolated-v2 staging');
let checks = 0;
for (const name of scripts) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  // External API calls must not bypass the isolated rejection boundary.
  assert.doesNotMatch(source, /\bUrlFetchApp\s*\.\s*(?:fetch|fetchAll)\s*\(/, name);
  assert.doesNotMatch(source, /\bScriptApp\s*\.\s*getOAuthToken\s*\(/, name);
  checks += 2;
}
const boundary = fs.readFileSync(path.join(root, '02_external_boundary.gs'), 'utf8');
const stops = fs.readFileSync(path.join(root, '03_isolated_v2_stops.gs'), 'utf8');
assert.match(boundary, /function routeqQaRejectExternalFetch_/);
assert.match(boundary, /all outbound HTTP disabled/);
assert.match(stops, /function routeqQaBlockSensitiveEntry_/);
assert.match(stops, /sensitive entry blocked/);
checks += 4;
console.log('Isolated GAS network-bypass inventory: ' + checks + '/' + checks + ' PASS (' + scripts.length + ' GS files); network requests: 0');
