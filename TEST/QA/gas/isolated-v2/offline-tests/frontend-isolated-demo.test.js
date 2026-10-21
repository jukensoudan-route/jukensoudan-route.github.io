const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'hyogo', 'index.html'), 'utf8');
const match = html.match(/<script type="text\/javascript" id="routeq-isolated-demo">([\s\S]*?)<\/script>/);
assert.ok(match, 'Enabled isolated demo script was not found');
new vm.Script(match[1], { filename: 'TEST/QA/hyogo/index.html#routeq-isolated-demo' });

assert.match(match[1], /const ISOLATED_DEMO = true/);
assert.match(match[1], /ISOLATED_DEMO_TOKEN/);
assert.match(match[1], /routeq-isolated-demo-receipts/);
assert.match(match[1], /外部連携を利用できません/);
assert.match(html, /外部送信・課金・LINE連携は行いません/);
assert.doesNotMatch(match[1], /const GAS_WEB_APP_URL = "https?:/);
assert.doesNotMatch(match[1], /const LIFF_ID = "[^"\s]+"/);

console.log('Frontend isolated demo: 8/8 PASS; external endpoints configured: 0');
