/**
 * Aether Sovereign Desktop — Electron main process.
 * ═══════════════════════════════════════════════════════════════════
 *
 * A real, installable desktop app: no Cloudflare account, no VPS, no
 * deployment step. Spawns a local Node http server (server.js — plain
 * Node, no Electron dependency, independently curl-testable) that runs
 * the exact same route logic as the Cloudflare console
 * (apps/aether-console/functions/api/core.js, imported directly, not
 * duplicated) and persists state to a JSON file in the OS user-data
 * directory instead of Cloudflare KV. Serves the console's existing
 * static UI (apps/aether-console/index.html) unmodified.
 *
 * Three transports now share one route implementation:
 *   - functions/api/[[path]].js   Cloudflare Pages Functions (KV)
 *   - server.js + main.js         Electron desktop (local JSON file)
 *   - aether_platform/api/*.py    Python, self-hosted / Python Workers
 */

'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createServer } = require('./server.js');

const PORT = 7873; // 873 = the organism's heartbeat interval, prefixed for a free local port

let mainWindow = null;
let localServer = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Aether Sovereign Console',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  const statePath = path.join(app.getPath('userData'), 'aether-state.json');
  localServer = createServer(statePath, PORT);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') app.quit();
});
