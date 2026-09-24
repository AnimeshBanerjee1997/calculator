'use strict';

// Bug registry: every bug that is fixed gets a test here, tagged with its ID,
// so it can never come back unnoticed. Never delete an entry. Add new ones at
// the bottom and list them in docs/REGRESSION.md.
// Frontend-only bugs live in test/e2e/calculator.spec.js with the same ID format.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { calculate } = require('../../lib/calc');
const { useServer, rawGet } = require('../helpers/server');

const ctx = useServer();

test('BUG-001: floating point drift (0.1 + 0.2 must be 0.3)', () => {
  assert.strictEqual(calculate('0.1', '0.2', 'add'), '0.3');
  assert.strictEqual(calculate('0.7', '0.1', 'multiply'), '0.07');
  assert.strictEqual(calculate('1.1', '1.1', 'multiply'), '1.21');
});

test('BUG-002: rounding that carries into an 11th digit must be LIMIT_OVER', () => {
  assert.throws(() => calculate('9999999999', '0.6', 'add'), { code: 'LIMIT_OVER' });
  assert.throws(() => calculate('9999999999', '0.5', 'add'), { code: 'LIMIT_OVER' }); // exact half rounds up
  assert.strictEqual(calculate('9999999999', '0.4', 'add'), '9999999999'); // just below the boundary
});

test('BUG-003: malformed URL encoding crashed the whole server', async () => {
  const bad = await rawGet(ctx, '/%E0');
  assert.strictEqual(bad.status, 400);
  const after = await rawGet(ctx, '/');
  assert.strictEqual(after.status, 200, 'server must still be alive after a malformed request');
});

test('BUG-004: results must never be "-0"', () => {
  assert.strictEqual(calculate('-1', '0', 'multiply'), '0');
  assert.strictEqual(calculate('-0.5', '0.5', 'add'), '0');
  assert.strictEqual(calculate('-1', '9999999999', 'divide'), '0');
});

test('BUG-005: static files must not leak from sibling folders sharing the "public" prefix', async (t) => {
  // A real sibling folder whose name starts with "public", holding a secret.
  const probeDir = path.join(__dirname, '..', '..', 'public-regression-probe');
  fs.mkdirSync(probeDir, { recursive: true });
  fs.writeFileSync(path.join(probeDir, 'secret.txt'), 'TOP-SECRET');
  t.after(() => fs.rmSync(probeDir, { recursive: true, force: true }));

  const probes = [
    '/..%2fpublic-regression-probe%2fsecret.txt',
    '/../public-regression-probe/secret.txt',
    '/..%2f..%2fpackage.json',
    '/..%5cserver.js',
  ];
  for (const p of probes) {
    const res = await rawGet(ctx, p);
    assert.ok([400, 403, 404].includes(res.status), `${p} returned ${res.status}`);
    assert.doesNotMatch(res.body, /TOP-SECRET|require\(|"scripts"/, `${p} leaked file contents`);
  }
});
