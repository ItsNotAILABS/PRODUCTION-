#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const PORT = process.env.PORT ? Number(process.env.PORT) : 4873;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function send(res, status, body, contentType) {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    const ext = path.extname(filePath);
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/sandcastle-summary') {
    const summaryPath = path.join(REPO_ROOT, 'docs', 'sandcastle-summary.json');
    serveFile(res, summaryPath);
    return;
  }

  if (url.pathname === '/api/sandcastle-report') {
    const reportPath = path.join(REPO_ROOT, 'docs', 'sandcastle-report.md');
    serveFile(res, reportPath);
    return;
  }

  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  // keep static serving confined to this app's directory only
  const resolved = path.normalize(path.join(ROOT, pathname));
  if (!resolved.startsWith(ROOT)) {
    send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }
  serveFile(res, resolved);
});

server.listen(PORT, () => {
  console.log(`Organism Command Deck — http://localhost:${PORT}`);
});
