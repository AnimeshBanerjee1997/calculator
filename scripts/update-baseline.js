'use strict';

// Regenerates test/regression/baselines/calc-golden.json from the CURRENT engine.
//
// Only run this when a behaviour change is intentional. The diff of the JSON file
// is then reviewed in the pull request like any other code change.
//
//   npm run baseline:update

const fs = require('node:fs');
const path = require('node:path');
const { calculate, OPERATIONS } = require('../lib/calc');

// Operands chosen to hit the edges: zero, signs, tiny/huge, rounding, 10-digit limits.
const OPERANDS = [
  '0', '1', '-1', '2', '3', '7', '9', '10',
  '0.1', '0.2', '0.5', '-0.5', '0.000000001', '3.14159', '1234.5678',
  '99999', '100000', '123456789', '9999999999', '-9999999999',
];

function run(a, b, operation) {
  try {
    return { result: calculate(a, b, operation) };
  } catch (err) {
    return { error: err.code };
  }
}

function buildCases() {
  const cases = [];
  for (const operation of OPERATIONS) {
    for (const a of OPERANDS) {
      for (const b of OPERANDS) {
        cases.push({ a, b, operation, ...run(a, b, operation) });
      }
    }
  }
  return cases;
}

const BASELINE_PATH = path.join(__dirname, '..', 'test', 'regression', 'baselines', 'calc-golden.json');

if (require.main === module) {
  const cases = buildCases();
  fs.writeFileSync(BASELINE_PATH, JSON.stringify({ version: 1, count: cases.length, cases }, null, 1) + '\n');
  console.log(`Wrote ${cases.length} golden cases to ${path.relative(process.cwd(), BASELINE_PATH)}`);
}

module.exports = { OPERANDS, BASELINE_PATH };
