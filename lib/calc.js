'use strict';

// Exact decimal arithmetic on BigInt so results like 0.1 + 0.2 come out as 0.3,
// not 0.30000000000000004. A number is { v: BigInt, s: scale } meaning v / 10^s.

const MAX_DIGITS = 10;
const DIVISION_PRECISION = 25; // fraction digits kept before final rounding

const OPERATIONS = ['add', 'subtract', 'multiply', 'divide'];

class CalcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const pow10 = (n) => 10n ** BigInt(n);
const abs = (n) => (n < 0n ? -n : n);

function countDigits(str) {
  return str.replace(/[^0-9]/g, '').length;
}

function parse(input) {
  const str = String(input ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new CalcError('INVALID_NUMBER', `"${str}" is not a valid number`);
  }
  if (countDigits(str) > MAX_DIGITS) {
    throw new CalcError('INPUT_TOO_LONG', `Numbers can have at most ${MAX_DIGITS} digits`);
  }
  const [whole, frac = ''] = str.split('.');
  return { v: BigInt(whole + frac), s: frac.length };
}

function rescale(n, s) {
  return n.v * pow10(s - n.s);
}

function add(a, b) {
  const s = Math.max(a.s, b.s);
  return { v: rescale(a, s) + rescale(b, s), s };
}

function subtract(a, b) {
  return add(a, { v: -b.v, s: b.s });
}

function multiply(a, b) {
  return { v: a.v * b.v, s: a.s + b.s };
}

function divide(a, b) {
  if (b.v === 0n) throw new CalcError('DIVIDE_BY_ZERO', 'Cannot divide by zero');
  // a/b = (a.v * 10^b.s) / (b.v * 10^a.s); scale up the numerator for precision.
  const num = a.v * pow10(b.s + DIVISION_PRECISION);
  const den = b.v * pow10(a.s);
  return { v: num / den, s: DIVISION_PRECISION }; // BigInt division truncates toward zero
}

// Round half-up (away from zero) to `scale` fraction digits.
function roundTo(n, scale) {
  if (n.s <= scale) return n;
  const factor = pow10(n.s - scale);
  const mag = abs(n.v);
  let q = mag / factor;
  if ((mag % factor) * 2n >= factor) q += 1n;
  return { v: n.v < 0n ? -q : q, s: scale };
}

function integerDigits(n) {
  return (abs(n.v) / pow10(n.s)).toString().length;
}

// Fit the result into MAX_DIGITS total digits, or report LIMIT_OVER.
function format(n) {
  if (integerDigits(n) > MAX_DIGITS) {
    throw new CalcError('LIMIT_OVER', `Result is more than ${MAX_DIGITS} digits`);
  }
  const rounded = roundTo(n, MAX_DIGITS - integerDigits(n));
  if (integerDigits(rounded) > MAX_DIGITS) {
    throw new CalcError('LIMIT_OVER', `Result is more than ${MAX_DIGITS} digits`);
  }

  const digits = abs(rounded.v).toString().padStart(rounded.s + 1, '0');
  const whole = digits.slice(0, digits.length - rounded.s);
  const frac = digits.slice(digits.length - rounded.s).replace(/0+$/, '');
  const body = frac ? `${whole}.${frac}` : whole;
  return rounded.v < 0n && body !== '0' ? `-${body}` : body;
}

const IMPLEMENTATIONS = { add, subtract, multiply, divide };

function calculate(a, b, operation) {
  if (!OPERATIONS.includes(operation)) {
    throw new CalcError('INVALID_OPERATION', `Unknown operation "${operation}"`);
  }
  return format(IMPLEMENTATIONS[operation](parse(a), parse(b)));
}

module.exports = { calculate, CalcError, MAX_DIGITS, OPERATIONS };
