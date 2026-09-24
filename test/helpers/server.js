'use strict';

// Starts the real app server on a random free port for the duration of a test file.
// Each test file runs in its own process, so sharing the single exported server is safe.

const http = require('node:http');
const { before, after } = require('node:test');
const server = require('../../server');

const REQUEST_TIMEOUT_MS = 5000;

function useServer() {
  const ctx = { url: null };
  before(() => new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      ctx.url = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  }));
  after(() => new Promise((resolve) => {
    server.closeAllConnections(); // don't let a stuck keep-alive socket hold the run open
    server.close(resolve);
  }));
  return ctx;
}

function postCalc(ctx, body, headers = {}) {
  return fetch(`${ctx.url}/api/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

// fetch() normalises URLs (it would turn "/%E0" or "/../x" into something safe),
// so raw paths are sent with node:http to hit the server exactly as a client could.
function rawGet(ctx, rawPath) {
  const { hostname, port } = new URL(ctx.url);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: rawPath, method: 'GET', timeout: REQUEST_TIMEOUT_MS }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    // A server that throws instead of answering must fail the test, not hang it.
    req.on('timeout', () => req.destroy(new Error(`No response for ${rawPath} within ${REQUEST_TIMEOUT_MS}ms`)));
    req.on('error', reject);
    req.end();
  });
}

module.exports = { useServer, postCalc, rawGet };
