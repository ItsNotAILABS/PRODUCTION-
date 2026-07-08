/**
 * Aether Sovereign Desktop — local HTTP server.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Pure Node (no Electron import) so it can be started and curl-tested
 * standalone, independent of the Electron GUI shell. main.js requires
 * this and points a BrowserWindow at it.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { freshState, route } = require('../aether-console/functions/api/core.js');

const STATIC_ROOT = path.join(__dirname, '..', 'aether-console');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function loadState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return freshState();
  }
}

function saveState(statePath, state) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state));
  } catch (e) {
    console.error('[Aether Desktop] Failed to persist state:', e.message);
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(STATIC_ROOT, rel));
  if (!resolved.startsWith(STATIC_ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/**
 * Create and start the local server. `statePath` is a JSON file path used
 * for persistence (in the real app, under Electron's userData directory).
 */
function createServer(statePath, port = 7873, host = '127.0.0.1') {
  let state = loadState(statePath);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}:${port}`);

    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const result = route(req.method, url.pathname, body, state);
      if (result.dirty) saveState(statePath, state);
      const payload = JSON.stringify(result.data, null, 2);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(payload);
      return;
    }

    serveStatic(req, res, url.pathname);
  });

  server.listen(port, host, () => {
    console.log(`[Aether Desktop] Local server running on http://${host}:${port}`);
  });

  return server;
}

module.exports = { createServer, STATIC_ROOT };
