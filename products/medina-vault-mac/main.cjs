// main.cjs — Medina Vault macOS shell.
// Runs the dashboard HTTP server in-process and lives in the menu bar.
// The vault MCP server is started on demand by MCP clients (Claude Desktop,
// Cursor, Cline, Continue, Zed) via the config snippet this app writes for them.

const { app, Tray, Menu, shell, dialog, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const { writeFileSync, mkdirSync, existsSync, copyFileSync, readFileSync } = require('node:fs');
const { join, dirname, resolve } = require('node:path');
const os = require('node:os');

const PORT       = Number(process.env.MEDINA_DASHBOARD_PORT || 8731);
const MEDINA     = process.env.MEDINA_HOME       || join(os.homedir(), '.medina');
const VAULT_PATH = process.env.MEDINA_VAULT_PATH || join(MEDINA, 'vault.json');
const SIGNAL_PATH= process.env.MEDINA_SIGNAL_PATH|| join(MEDINA, 'signal.json');
const OPERATOR   = process.env.MEDINA_OPERATOR_ID|| os.userInfo().username;

// Resolve bundled server paths (works from app.asar and from dev).
const APP_ROOT = app.isPackaged
  ? join(process.resourcesPath, 'app.asar')
  : resolve(__dirname);
const DASHBOARD_SERVER = join(APP_ROOT, '..', 'medina-dashboard', 'src', 'server.mjs');
const VAULT_SERVER     = join(APP_ROOT, '..', 'medina-vault',     'src', 'server.mjs');

let tray = null;
let dashboardProc = null;

function startDashboard() {
  if (dashboardProc) return;
  dashboardProc = spawn(process.execPath, [DASHBOARD_SERVER], {
    env: { ...process.env,
      MEDINA_DASHBOARD_PORT: String(PORT),
      MEDINA_VAULT_PATH:  VAULT_PATH,
      MEDINA_SIGNAL_PATH: SIGNAL_PATH,
      MEDINA_OPERATOR_ID: OPERATOR,
    },
    stdio: 'ignore', detached: false,
  });
  dashboardProc.on('exit', () => { dashboardProc = null; });
}

function stopDashboard() {
  if (!dashboardProc) return;
  try { dashboardProc.kill(); } catch {}
  dashboardProc = null;
}

function openDashboard() {
  startDashboard();
  setTimeout(() => shell.openExternal(`http://localhost:${PORT}`), 300);
}

// Write MCP config snippets so Claude Desktop / Cursor / Cline / Continue / Zed
// pick up the vault on next launch. Backs up first. Same logic as
// tools/install-all.mjs but inlined for the packaged app.
function wireMcpClients() {
  const home = os.homedir();
  const snippet = {
    command: 'node', args: [VAULT_SERVER],
    env: { MEDINA_OPERATOR_ID: OPERATOR, MEDINA_VAULT_PATH: VAULT_PATH },
  };
  const targets = [
    [join(home, 'Library/Application Support/Claude/claude_desktop_config.json'), 'mcpServers'],
    [join(home, '.cursor/mcp.json'),                                                'mcpServers'],
    [join(home, 'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json'), 'mcpServers'],
    [join(home, '.config/zed/settings.json'),                                       'context_servers'],
  ];
  let wrote = 0;
  for (const [p, rootKey] of targets) {
    try {
      mkdirSync(dirname(p), { recursive: true });
      const bak = p + '.medina-bak';
      if (existsSync(p) && !existsSync(bak)) copyFileSync(p, bak);
      let obj = {};
      if (existsSync(p)) { try { obj = JSON.parse(readFileSync(p, 'utf8')); } catch {} }
      obj[rootKey] = obj[rootKey] || {};
      obj[rootKey]['medina-vault'] = snippet;
      writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
      wrote++;
    } catch (e) { /* skip targets we can't write */ }
  }
  dialog.showMessageBox({
    type: 'info', title: 'Medina Vault',
    message: `Wired ${wrote} MCP client(s). Restart each app to load the vault.`,
  });
}

function showAbout() {
  const win = new BrowserWindow({
    width: 540, height: 380, resizable: false,
    title: 'Medina Vault', backgroundColor: '#07090e',
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <html><body style="font-family:-apple-system;background:#07090e;color:#e5e8ef;padding:32px">
      <h2 style="margin:0 0 8px;color:#d4a843">𓂀 Medina Vault</h2>
      <div style="color:#6b7280;font-size:12px">MEDINA-PROTOCOL/0.2 · φ=1.618 · heartbeat 873ms</div>
      <p>Sovereign local AI memory. The vault file lives at:</p>
      <code style="color:#d4a843">${VAULT_PATH}</code>
      <p>Dashboard: <a style="color:#34d399" href="http://localhost:${PORT}">http://localhost:${PORT}</a></p>
      <p style="color:#6b7280;font-size:12px">Architect: Alfredo Medina Hernandez. Built with Claude Opus 4.7 under the Creator's License.</p>
    </body></html>`));
}

app.whenReady().then(() => {
  // Try icon next to main.cjs, fall back to no icon (text-only menu bar)
  let trayIcon = null;
  try { trayIcon = join(APP_ROOT, 'tray-icon.png'); } catch {}
  tray = new Tray(trayIcon || (app.isPackaged ? join(process.resourcesPath, 'tray-icon.png') : ''));
  tray.setToolTip('Medina Vault');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open dashboard',     click: openDashboard },
    { label: 'Wire MCP clients',   click: wireMcpClients },
    { type: 'separator' },
    { label: 'Reveal vault file',  click: () => shell.showItemInFolder(VAULT_PATH) },
    { label: 'About',              click: showAbout },
    { type: 'separator' },
    { label: 'Quit',               click: () => { stopDashboard(); app.quit(); } },
  ]));

  // Start dashboard immediately so the user can just click "Open dashboard"
  startDashboard();
});

app.on('window-all-closed', (e) => e.preventDefault()); // stay alive in tray
app.on('before-quit', stopDashboard);
