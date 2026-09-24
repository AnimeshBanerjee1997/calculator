'use strict';

// Unit tests: the calculation engine's documented rules, one behaviour per test.

const test = require('node:test');
const assert = require('node:assert');
const { calculate, CalcError, MAX_DIGITS, OPERATIONS } = require('../../lib/calc');

const errorCode = (fn) => {
  try { fn(); } catch (err) { return err.code; }
  return null;
};

test('exports the public contract', () => {
  assert.strictEqual(MAX_DIGITS, 10);
  assert.deepStrictEqual(OPERATIONS, ['add', 'subtract', 'multiply', 'divide']);
  const err = new CalcError('X', 'msg');
  assert.ok(err instanceof Error);
  assert.strictEqual(err.code, 'X');
});

test('basic operations', () => {
  assert.strictEqual(calculate('2', '3', 'add'), '5');
  assert.strictEqual(calculate('2', '3', 'subtract'), '-1');
  assert.strictEqual(calculate('6', '7', 'multiply'), '42');
  assert.strictEqual(calculate('10', '4', 'divide'), '2.5');
});

test('exact decimals', () => {
  assert.strictEqual(calculate('0.1', '0.2', 'add'), '0.3');
  assert.strictEqual(calculate('1.5', '1.5', 'subtract'), '0');
  assert.strictEqual(calculate('-0.5', '0.5', 'multiply'), '-0.25');
  assert.strictEqual(calculate('1.10', '2.20', 'add'), '3.3'); // trailing zeros stripped
});

test('division is rounded half-up to fit 10 digits', () => {
  assert.strictEqual(calculate('1', '3', 'divide'), '0.333333333');
  assert.strictEqual(calculate('2', '3', 'divide'), '0.666666667');
  assert.strictEqual(calculate('100000', '3', 'divide'), '33333.33333');
  assert.strictEqual(calculate('-1', '3', 'divide'), '-0.333333333');
  assert.strictEqual(calculate('-2', '3', 'divide'), '-0.666666667');
});

test('10-digit results are allowed', () => {
  assert.strictEqual(calculate('9999999998', '1', 'add'), '9999999999');
  assert.strictEqual(calculate('-9999999998', '1', 'subtract'), '-9999999999');
  assert.strictEqual(calculate('99999', '100000', 'multiply'), '9999900000');
});

test('results over 10 digits give LIMIT_OVER', () => {
  assert.strictEqual(errorCode(() => calculate('9999999999', '1', 'add')), 'LIMIT_OVER');
  assert.strictEqual(errorCode(() => calculate('-9999999999', '1', 'subtract')), 'LIMIT_OVER');
  assert.strictEqual(errorCode(() => calculate('100000', '100000', 'multiply')), 'LIMIT_OVER');
  assert.strictEqual(errorCode(() => calculate('9999999999', '0.1', 'divide')), 'LIMIT_OVER');
});

test('invalid input', () => {
  assert.strictEqual(errorCode(() => calculate('1', '0', 'divide')), 'DIVIDE_BY_ZERO');
  assert.strictEqual(errorCode(() => calculate('1', '0.000', 'divide')), 'DIVIDE_BY_ZERO');
  assert.strictEqual(errorCode(() => calculate('abc', '1', 'add')), 'INVALID_NUMBER');
  assert.strictEqual(errorCode(() => calculate('', '1', 'add')), 'INVALID_NUMBER');
  assert.strictEqual(errorCode(() => calculate(undefined, '1', 'add')), 'INVALID_NUMBER');
  assert.strictEqual(errorCode(() => calculate('1.', '1', 'add')), 'INVALID_NUMBER');
  assert.strictEqual(errorCode(() => calculate('1e5', '1', 'add')), 'INVALID_NUMBER');
  assert.strictEqual(errorCode(() => calculate('12345678901', '1', 'add')), 'INPUT_TOO_LONG');
  assert.strictEqual(errorCode(() => calculate('1', '1', 'power')), 'INVALID_OPERATION');
});

test('whitespace around numbers is tolerated', () => {
  assert.strictEqual(calculate(' 4 ', '\t2', 'multiply'), '8');
});
