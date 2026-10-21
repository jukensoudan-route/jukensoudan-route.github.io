const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourceDirectory = path.join(__dirname, '..');
const files = fs.readdirSync(sourceDirectory)
  .filter((file) => file.endsWith('.gs'))
  .sort();

assert.ok(files.length > 0, 'No isolated-v2 GAS files found');

const sources = files.map((file) => {
  const source = fs.readFileSync(path.join(sourceDirectory, file), 'utf8');
  new vm.Script(source, { filename: file });
  return source;
});

new vm.Script(sources.join('\n'), { filename: 'isolated-v2-concatenated.gs' });

const declarations = new Map();
for (const [index, source] of sources.entries()) {
  const expression = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (let match = expression.exec(source); match; match = expression.exec(source)) {
    const locations = declarations.get(match[1]) || [];
    locations.push(files[index]);
    declarations.set(match[1], locations);
  }
}
const duplicates = [...declarations.entries()]
  .filter(([, locations]) => locations.length > 1);
assert.deepEqual(duplicates, [], 'Duplicate global function declarations found');

console.log(
  `isolated-v2 syntax: ${files.length}/${files.length} files PASS; ` +
  `concatenated PASS; ${declarations.size} unique functions`
);
