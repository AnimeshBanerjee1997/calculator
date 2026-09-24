'use strict';

// API contract regression: the frontend depends on these exact status codes and
// response shapes. Changing any of them is a breaking change.

const test = require('node:test');
const assert = require('node:assert');
const { useServer, postCalc, rawGet } = require('../helpers/server');

const ctx = useServer();

async function expectJson(res, status, body) {
  assert.strictEqual(res.status, status);
  assert.match(res.headers.get('content-type'), /^application\/json/);
  const json = await res.json();
  if (body) assert.deepStrictEqual(json, body);
  return json;
}

test('200: success shape is { ok, result }', async () => {
  await expectJson(await postCalc(ctx, { a: '12', b: '3', operation: 'add' }), 200, { ok: true, result: '15' });
  await expectJson(await postCalc(ctx, { a: '1', b: '3', operation: 'divide' }), 200, { ok: true, result: '0.333333333' });
});

test('numbers sent as JSON numbers are accepted', async () => {
  await expectJson(await postCalc(ctx, { a: 6, b: 7, operation: 'multiply' }), 200, { ok: true, result: '42' });
});

test('422: LIMIT_OVER', async () => {
  await expectJson(await postCalc(ctx, { a: '9999999999', b: '2', operation: 'multiply' }), 422,
    { ok: false, error: 'LIMIT_OVER', message: 'Result is more than 10 digits' });
});

test('422: DIVIDE_BY_ZERO', async () => {
  await expectJson(await postCalc(ctx, { a: '5', b: '0', operation: 'divide' }), 422,
    { ok: false, error: 'DIVIDE_BY_ZERO', message: 'Cannot divide by zero' });
});

test('400: validation errors', async () => {
  const cases = [
    [{ a: 'abc', b: '1', operation: 'add' }, 'INVALID_NUMBER'],
    [{ b: '1', operation: 'add' }, 'INVALID_NUMBER'],
    [{ a: '12345678901', b: '1', operation: 'add' }, 'INPUT_TOO_LONG'],
    [{ a: '1', b: '1', operation: 'modulo' }, 'INVALID_OPERATION'],
    [{ a: '1', b: '1' }, 'INVALID_OPERATION'],
  ];
  for (const [body, code] of cases) {
    const json = await expectJson(await postCalc(ctx, body), 400);
    assert.strictEqual(json.ok, false);
    assert.strictEqual(json.error, code, JSON.stringify(body));
    assert.strictEqual(typeof json.message, 'string');
  }
});

test('400: malformed and oversized bodies', async () => {
  for (const body of ['{not json', '', 'null', '[]']) {
    const res = await postCalc(ctx, body);
    assert.strictEqual(res.status, 400, `body ${JSON.stringify(body)}`);
    assert.strictEqual((await res.json()).ok, false);
  }
  const huge = JSON.stringify({ a: '1', b: '1', operation: 'add', pad: 'x'.repeat(5000) });
  let status;
  try {
    status = (await postCalc(ctx, huge)).status;
  } catch {
    status = 'connection closed'; // server may drop the socket mid-upload, also acceptable
  }
  assert.ok(status === 400 || status === 'connection closed', `oversized body gave ${status}`);
  // and the server survives it
  await expectJson(await postCalc(ctx, { a: '1', b: '1', operation: 'add' }), 200, { ok: true, result: '2' });
});

test('405: only POST is allowed on the API', async () => {
  const res = await fetch(`${ctx.url}/api/calculate`);
  await expectJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
  const put = await fetch(`${ctx.url}/`, { method: 'PUT' });
  assert.strictEqual(put.status, 405);
});

test('static assets are served with the right content types', async () => {
  const expected = {
    '/': 'text/html',
    '/index.html': 'text/html',
    '/styles.css': 'text/css',
    '/app.js': 'text/javascript',
    '/favicon.svg': 'image/svg+xml',
  };
  for (const [p, type] of Object.entries(expected)) {
    const res = await rawGet(ctx, p);
    assert.strictEqual(res.status, 200, p);
    assert.ok(res.headers['content-type'].startsWith(type), `${p}: ${res.headers['content-type']}`);
  }
  assert.strictEqual((await rawGet(ctx, '/missing.js')).status, 404);
});

test('page ships every key the UI needs', async () => {
  const { body } = await rawGet(ctx, '/');
  for (const d of '0123456789') assert.match(body, new RegExp(`data-digit="${d}"`));
  for (const op of ['add', 'subtract', 'multiply', 'divide']) assert.match(body, new RegExp(`data-op="${op}"`));
  for (const a of ['clear', 'sign', 'backspace', 'decimal', 'equals']) assert.match(body, new RegExp(`data-action="${a}"`));
});
