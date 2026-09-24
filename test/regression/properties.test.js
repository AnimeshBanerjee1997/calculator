'use strict';

// Property-based regression: thousands of seeded pseudo-random inputs checked against
// independent BigInt reference maths and algebraic invariants. The seed is fixed, so
// failures reproduce exactly. Set REGRESSION_SEED to explore other inputs.

const test = require('node:test');
const assert = require('node:assert');
const { calculate } = require('../../lib/calc');

const SEED = Number(process.env.REGRESSION_SEED) || 20260925;
const RUNS = 3000;
const LIMIT = 10n ** 10n;

// mulberry32: tiny deterministic PRNG
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = prng(SEED);
const randInt = (max) => Math.floor(rand() * max);

// Random integer string with 1–10 digits and random sign, as a user could type.
function randomInteger() {
  const len = 1 + randInt(10);
  let s = String(1 + randInt(9));
  for (let i = 1; i < len; i++) s += randInt(10);
  if (len === 1 && rand() < 0.1) s = '0';
  return rand() < 0.3 && s !== '0' ? `-${s}` : s;
}

// Random decimal string, at most 10 digits in total.
function randomDecimal() {
  const intLen = 1 + randInt(5);
  const fracLen = 1 + randInt(10 - intLen);
  let s = String(randInt(10));
  for (let i = 1; i < intLen; i++) s += randInt(10);
  s = s.replace(/^0+(?=\d)/, '');
  let f = '';
  for (let i = 0; i < fracLen; i++) f += randInt(10);
  const out = `${s}.${f}`;
  return rand() < 0.3 ? `-${out}` : out;
}

const attempt = (a, b, op) => {
  try { return { result: calculate(a, b, op) }; } catch (err) { return { error: err.code }; }
};

const digitCount = (s) => s.replace(/[^0-9]/g, '').length;

// Parse a decimal string into { v, s } for exact comparisons.
function toScaled(str) {
  const [w, f = ''] = str.split('.');
  return { v: BigInt(w + f), s: f.length };
}

const ctx = (a, b, op) => `seed=${SEED} ${a} ${op} ${b}`;

test(`integer add/subtract/multiply match BigInt reference (${RUNS} runs)`, () => {
  const ref = { add: (x, y) => x + y, subtract: (x, y) => x - y, multiply: (x, y) => x * y };
  for (let i = 0; i < RUNS; i++) {
    const a = randomInteger();
    const b = randomInteger();
    for (const op of Object.keys(ref)) {
      const expected = ref[op](BigInt(a), BigInt(b));
      const actual = attempt(a, b, op);
      const absExpected = expected < 0n ? -expected : expected;
      if (absExpected >= LIMIT) {
        assert.deepStrictEqual(actual, { error: 'LIMIT_OVER' }, ctx(a, b, op));
      } else {
        assert.deepStrictEqual(actual, { result: expected.toString() }, ctx(a, b, op));
      }
    }
  }
});

test(`division is correctly rounded to within half a unit (${RUNS} runs)`, () => {
  for (let i = 0; i < RUNS; i++) {
    const a = randomInteger();
    const b = randomInteger();
    const actual = attempt(a, b, 'divide');
    if (b === '0') {
      assert.deepStrictEqual(actual, { error: 'DIVIDE_BY_ZERO' }, ctx(a, b, 'divide'));
      continue;
    }
    if (actual.error) {
      assert.strictEqual(actual.error, 'LIMIT_OVER', ctx(a, b, 'divide'));
      const q = BigInt(a) / BigInt(b);
      // Allowed only when the quotient really needs 11+ digits (or rounds up into them).
      assert.ok((q < 0n ? -q : q) >= LIMIT - 1n, `unexpected LIMIT_OVER ${ctx(a, b, 'divide')}`);
      continue;
    }
    // |R/10^s − a/b| ≤ ½·10^−s  ⇔  2·|R·b − a·10^s| ≤ |b|
    const { v: R, s } = toScaled(actual.result);
    const A = BigInt(a);
    const B = BigInt(b);
    let diff = R * B - A * 10n ** BigInt(s);
    if (diff < 0n) diff = -diff;
    const absB = B < 0n ? -B : B;
    assert.ok(2n * diff <= absB, `not correctly rounded: got ${actual.result} for ${ctx(a, b, 'divide')}`);
    assert.ok(digitCount(actual.result) <= 10, `too many digits: ${actual.result}`);
  }
});

test(`algebraic invariants hold for decimals (${RUNS} runs)`, () => {
  for (let i = 0; i < RUNS; i++) {
    const a = randomDecimal();
    const b = randomDecimal();

    assert.deepStrictEqual(attempt(a, b, 'add'), attempt(b, a, 'add'), `add commutes ${ctx(a, b, 'add')}`);
    assert.deepStrictEqual(attempt(a, b, 'multiply'), attempt(b, a, 'multiply'), `multiply commutes ${ctx(a, b, 'multiply')}`);

    const ab = attempt(a, b, 'subtract');
    const ba = attempt(b, a, 'subtract');
    if (ab.result !== undefined) {
      const negated = ab.result === '0' ? '0' : ab.result.startsWith('-') ? ab.result.slice(1) : `-${ab.result}`;
      assert.deepStrictEqual(ba, { result: negated }, `subtract antisymmetric ${ctx(a, b, 'subtract')}`);
    }

    assert.deepStrictEqual(attempt(a, '0', 'add'), { result: calculate(a, '1', 'multiply') }, `identity ${a}`);
    assert.deepStrictEqual(attempt(a, a, 'subtract'), { result: '0' }, `a − a = 0 for ${a}`);
  }
});

test(`every successful result is well-formed (${RUNS} runs)`, () => {
  const ops = ['add', 'subtract', 'multiply', 'divide'];
  for (let i = 0; i < RUNS; i++) {
    const a = rand() < 0.5 ? randomInteger() : randomDecimal();
    const b = rand() < 0.5 ? randomInteger() : randomDecimal();
    const op = ops[randInt(4)];
    const { result } = attempt(a, b, op);
    if (result === undefined) continue;
    assert.match(result, /^-?(0|[1-9]\d*)(\.\d*[1-9])?$/, `malformed ${result} for ${ctx(a, b, op)}`);
    assert.notStrictEqual(result, '-0', ctx(a, b, op));
    assert.ok(digitCount(result) <= 10, `over 10 digits: ${result} for ${ctx(a, b, op)}`);
    // Results must be usable as the next input (calculator chaining).
    assert.doesNotThrow(() => calculate(result, '1', 'multiply'), ctx(a, b, op));
  }
});
