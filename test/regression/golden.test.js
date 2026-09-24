'use strict';

// Golden-master regression: every case in the baseline must still produce exactly
// the recorded result or error. A failure means behaviour changed. Either it's a
// regression (fix the code) or an intended change (run `npm run baseline:update`
// and explain the JSON diff in the PR).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { calculate, OPERATIONS } = require('../../lib/calc');
const { OPERANDS, BASELINE_PATH } = require('../../scripts/update-baseline');

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

test('baseline covers the full operand × operation matrix', () => {
  assert.strictEqual(baseline.count, baseline.cases.length);
  assert.strictEqual(baseline.cases.length, OPERANDS.length ** 2 * OPERATIONS.length,
    'Operands changed without regenerating the baseline (npm run baseline:update)');
});

for (const operation of OPERATIONS) {
  test(`golden cases: ${operation}`, () => {
    const mismatches = [];
    for (const c of baseline.cases.filter((x) => x.operation === operation)) {
      let actual;
      try {
        actual = { result: calculate(c.a, c.b, c.operation) };
      } catch (err) {
        actual = { error: err.code };
      }
      const expected = 'error' in c ? { error: c.error } : { result: c.result };
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(`${c.a} ${operation} ${c.b}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    }
    assert.deepStrictEqual(mismatches, [], `${mismatches.length} golden case(s) changed:\n${mismatches.join('\n')}`);
  });
}
