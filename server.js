'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { calculate, CalcError } = require('./lib/calc');

const PORT = Number(process.env.PORT) || 3456;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 1024;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const STATUS_BY_CODE = {
  LIMIT_OVER: 422,
  DIVIDE_BY_ZERO: 422,
  INVALID_NUMBER: 400,
  INPUT_TOO_LONG: 400,
  INVALID_OPERATION: 400,
  BAD_REQUEST: 400,
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new CalcError('BAD_REQUEST', 'Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleCalculate(req, res) {
  try {
    let data;
    try {
      data = JSON.parse(await readBody(req));
    } catch (err) {
      if (err instanceof CalcError) throw err;
      throw new CalcError('BAD_REQUEST', 'Body must be valid JSON');
    }
    const { a, b, operation } = data || {};
    const result = calculate(a, b, operation);
    sendJson(res, 200, { ok: true, result });
  } catch (err) {
    if (err instanceof CalcError) {
      sendJson(res, STATUS_BY_CODE[err.code] || 400, { ok: false, error: err.code, message: err.message });
    } else {
      console.error(err);
      sendJson(res, 500, { ok: false, error: 'SERVER_ERROR', message: 'Something went wrong' });
    }
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const type = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }).end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/calculate') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST' });
      return;
    }
    handleCalculate(req, res);
    return;
  }
  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405).end();
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Calculator running at http://localhost:${PORT}`));
}

module.exports = server;
