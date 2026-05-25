#!/usr/bin/env node

/**
 * create-extension — CLI Scaffolding for Browser Extensions
 *
 * Generates a new browser extension with all required files:
 * - manifest.json (Manifest V3)
 * - background.js (service worker)
 * - content.js (content script)
 * - popup.html/sidepanel.html (UI)
 * - icons/
 *
 * Usage:
 *   node builders/cli/create-extension.js my-extension
 *   node builders/cli/create-extension.js my-extension --preset full
 *
 * Options:
 *   --preset <name>   Use preset: minimal, standard, full (default: standard)
 *   --name <name>     Extension display name
 *   --description     Extension description
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ExtensionBuilder = require('../patterns/extension-builder');

/* ─── Colors ────────────────────────────────────────────────── */
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

/* ─── Default Templates ─────────────────────────────────────── */
const templates = {
  backgroundJs: `/**
 * {{name}} — Background Service Worker
 *
 * Handles background tasks, alarms, and extension lifecycle.
 */

'use strict';

/* ─── Extension Installed ───────────────────────────────────── */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('{{name}} installed:', details.reason);

  // Initialize storage with defaults
  chrome.storage.local.set({
    enabled: true,
    settings: {},
    version: chrome.runtime.getManifest().version,
  });
});

/* ─── Message Handler ───────────────────────────────────────── */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);

  switch (message.action) {
    case 'getStatus':
      chrome.storage.local.get(['enabled'], (data) => {
        sendResponse({ enabled: data.enabled });
      });
      return true; // Keep channel open for async response

    case 'toggle':
      chrome.storage.local.get(['enabled'], (data) => {
        const newState = !data.enabled;
        chrome.storage.local.set({ enabled: newState });
        sendResponse({ enabled: newState });
      });
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

/* ─── Heartbeat (optional) ──────────────────────────────────── */
const HEARTBEAT_INTERVAL = 873; // Organism standard

setInterval(() => {
  // Keep service worker alive and perform periodic tasks
}, HEARTBEAT_INTERVAL);

console.log('{{name}} service worker initialized');
`,

  contentJs: `/**
 * {{name}} — Content Script
 *
 * Runs in the context of web pages.
 */

'use strict';

(function() {
  /* ─── Guard against multiple injections ───────────────────── */
  if (window.__{{slug}}_initialized) return;
  window.__{{slug}}_initialized = true;

  console.log('{{name}} content script loaded');

  /* ─── Initialize ──────────────────────────────────────────── */
  function init() {
    // Add your content script logic here
  }

  /* ─── Message Handler ─────────────────────────────────────── */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'ping':
        sendResponse({ status: 'alive' });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  });

  /* ─── Run when DOM is ready ───────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`,

  popupHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      width: 320px;
      min-height: 200px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      padding: 16px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .header img {
      width: 32px;
      height: 32px;
    }

    .header h1 {
      font-size: 16px;
      font-weight: 600;
    }

    .status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
    }

    .status-indicator.inactive {
      background: #f87171;
    }

    button {
      width: 100%;
      padding: 12px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    button:hover {
      background: #2563eb;
    }

    .footer {
      margin-top: 16px;
      text-align: center;
      font-size: 12px;
      color: rgba(255,255,255,0.5);
    }
  </style>
</head>
<body>
  <div class="header">
    <img src="icons/icon48.png" alt="{{name}}">
    <h1>{{name}}</h1>
  </div>

  <div class="status">
    <span>Status</span>
    <div class="status-indicator" id="statusIndicator"></div>
  </div>

  <button id="toggleBtn">Toggle Extension</button>

  <div class="footer">
    Version <span id="version">1.0.0</span>
  </div>

  <script src="popup.js"></script>
</body>
</html>
`,

  popupJs: `/**
 * {{name}} — Popup Script
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const statusIndicator = document.getElementById('statusIndicator');
  const toggleBtn = document.getElementById('toggleBtn');
  const versionEl = document.getElementById('version');

  // Get version
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = manifest.version;

  // Get status
  const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
  updateStatus(response.enabled);

  // Toggle handler
  toggleBtn.addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ action: 'toggle' });
    updateStatus(result.enabled);
  });

  function updateStatus(enabled) {
    if (enabled) {
      statusIndicator.classList.remove('inactive');
      toggleBtn.textContent = 'Disable Extension';
    } else {
      statusIndicator.classList.add('inactive');
      toggleBtn.textContent = 'Enable Extension';
    }
  }
});
`,

  sidepanelHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}} — Side Panel</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f1a;
      color: #fff;
      min-height: 100vh;
    }

    .container {
      padding: 16px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 16px;
    }

    .header img {
      width: 24px;
      height: 24px;
    }

    .header h1 {
      font-size: 18px;
      font-weight: 600;
    }

    .content {
      color: rgba(255,255,255,0.7);
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="icons/icon48.png" alt="{{name}}">
      <h1>{{name}}</h1>
    </div>

    <div class="content">
      <p>Side panel content goes here.</p>
    </div>
  </div>
</body>
</html>
`,

  devtoolsHtml: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{name}} DevTools</title>
</head>
<body>
  <script src="devtools.js"></script>
</body>
</html>
`,

  devtoolsJs: `/**
 * {{name}} — DevTools Integration
 */

'use strict';

chrome.devtools.panels.create(
  '{{name}}',
  'icons/icon16.png',
  'devtools-panel.html',
  (panel) => {
    console.log('{{name}} DevTools panel created');
  }
);
`,

  devtoolsPanelHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{name}} — DevTools Panel</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 16px;
      margin: 0;
    }

    h1 {
      font-size: 16px;
      margin-bottom: 16px;
    }

    .info {
      background: #2d2d2d;
      padding: 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>{{name}} DevTools</h1>
  <div class="info">
    <p>DevTools panel content goes here.</p>
  </div>
</body>
</html>
`,
};

/* ─── Argument Parser ───────────────────────────────────────── */
function parseArgs(args) {
  const result = {
    slug: null,
    preset: 'standard',
    name: null,
    description: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--preset' && args[i + 1]) {
      result.preset = args[++i];
    } else if (arg === '--name' && args[i + 1]) {
      result.name = args[++i];
    } else if (arg === '--description' && args[i + 1]) {
      result.description = args[++i];
    } else if (!arg.startsWith('-') && !result.slug) {
      result.slug = arg;
    }
  }

  return result;
}

/* ─── Slug to Title Case ────────────────────────────────────── */
function toTitleCase(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/* ─── Template Processor ────────────────────────────────────── */
function processTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/* ─── Create Extension ──────────────────────────────────────── */
function createExtension(options) {
  const { slug, preset, name, description } = options;

  if (!slug) {
    console.log(`${c.red}Error: Extension slug is required${c.reset}`);
    console.log(`${c.dim}Usage: node builders/cli/create-extension.js <slug> [options]${c.reset}`);
    process.exit(1);
  }

  const displayName = name || toTitleCase(slug);
  const desc = description || `${displayName} — AI-powered browser extension`;

  // Find repo root
  const repoRoot = process.cwd();
  const extensionsDir = path.join(repoRoot, 'extensions');
  const extPath = path.join(extensionsDir, slug);

  // Check if already exists
  if (fs.existsSync(extPath)) {
    console.log(`${c.red}Error: Extension "${slug}" already exists at ${extPath}${c.reset}`);
    process.exit(1);
  }

  console.log('');
  console.log(`${c.bold}${c.cyan}  🏗  Creating Extension: ${displayName}${c.reset}`);
  console.log('');

  // Build manifest
  const builder = new ExtensionBuilder()
    .setName(displayName)
    .setVersion('1.0.0')
    .setDescription(desc)
    .usePreset(preset);

  const manifest = builder.build();

  // Template variables
  const vars = {
    name: displayName,
    slug: slug.replace(/-/g, '_'),
    description: desc,
  };

  // Create directory structure
  console.log(`  ${c.cyan}Creating directory:${c.reset} ${extPath}`);
  fs.mkdirSync(extPath, { recursive: true });
  fs.mkdirSync(path.join(extPath, 'icons'), { recursive: true });

  // Write manifest.json
  console.log(`  ${c.green}✓${c.reset} manifest.json`);
  fs.writeFileSync(
    path.join(extPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Write background.js
  console.log(`  ${c.green}✓${c.reset} background.js`);
  fs.writeFileSync(
    path.join(extPath, 'background.js'),
    processTemplate(templates.backgroundJs, vars)
  );

  // Write content.js
  console.log(`  ${c.green}✓${c.reset} content.js`);
  fs.writeFileSync(
    path.join(extPath, 'content.js'),
    processTemplate(templates.contentJs, vars)
  );

  // Write popup files (for standard and full presets)
  if (preset !== 'minimal') {
    console.log(`  ${c.green}✓${c.reset} popup.html`);
    fs.writeFileSync(
      path.join(extPath, 'popup.html'),
      processTemplate(templates.popupHtml, vars)
    );

    console.log(`  ${c.green}✓${c.reset} popup.js`);
    fs.writeFileSync(
      path.join(extPath, 'popup.js'),
      processTemplate(templates.popupJs, vars)
    );
  }

  // Write sidepanel files (for full preset)
  if (preset === 'full') {
    console.log(`  ${c.green}✓${c.reset} sidepanel.html`);
    fs.writeFileSync(
      path.join(extPath, 'sidepanel.html'),
      processTemplate(templates.sidepanelHtml, vars)
    );

    console.log(`  ${c.green}✓${c.reset} devtools.html`);
    fs.writeFileSync(
      path.join(extPath, 'devtools.html'),
      processTemplate(templates.devtoolsHtml, vars)
    );

    console.log(`  ${c.green}✓${c.reset} devtools.js`);
    fs.writeFileSync(
      path.join(extPath, 'devtools.js'),
      processTemplate(templates.devtoolsJs, vars)
    );

    console.log(`  ${c.green}✓${c.reset} devtools-panel.html`);
    fs.writeFileSync(
      path.join(extPath, 'devtools-panel.html'),
      processTemplate(templates.devtoolsPanelHtml, vars)
    );
  }

  // Create placeholder icons
  console.log(`  ${c.green}✓${c.reset} icons/ (placeholders)`);
  for (const size of [16, 48, 128]) {
    const iconPath = path.join(extPath, 'icons', `icon${size}.png`);
    // Create a simple placeholder (1x1 transparent PNG)
    // In practice, you'd want to generate proper icons or copy templates
    const placeholder = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    fs.writeFileSync(iconPath, placeholder);
  }

  // Create workspace file
  console.log(`  ${c.green}✓${c.reset} ${slug}.code-workspace`);
  const workspace = {
    folders: [{ path: '.' }],
    settings: {},
  };
  fs.writeFileSync(
    path.join(extPath, `${slug}.code-workspace`),
    JSON.stringify(workspace, null, 2)
  );

  console.log('');
  console.log(`${c.bold}${c.green}  ✓ Extension created successfully!${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Location:${c.reset} ${extPath}`);
  console.log(`  ${c.dim}Preset:${c.reset}   ${preset}`);
  console.log('');
  console.log(`  ${c.dim}Next steps:${c.reset}`);
  console.log(`    1. Run ${c.cyan}node scripts/generate-icons.js${c.reset} to generate proper icons`);
  console.log(`    2. Load in Chrome: chrome://extensions → Load unpacked → ${extPath}`);
  console.log('');

  return extPath;
}

/* ─── CLI Entry Point ───────────────────────────────────────── */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log(`${c.bold}${c.cyan}  create-extension — Scaffold a new browser extension${c.reset}`);
    console.log('');
    console.log(`  ${c.bold}Usage:${c.reset}`);
    console.log(`    node builders/cli/create-extension.js <slug> [options]`);
    console.log('');
    console.log(`  ${c.bold}Options:${c.reset}`);
    console.log(`    --preset <name>     Preset: minimal, standard, full (default: standard)`);
    console.log(`    --name <name>       Extension display name`);
    console.log(`    --description <d>   Extension description`);
    console.log(`    --help, -h          Show this help`);
    console.log('');
    console.log(`  ${c.bold}Examples:${c.reset}`);
    console.log(`    node builders/cli/create-extension.js my-extension`);
    console.log(`    node builders/cli/create-extension.js ai-helper --preset full`);
    console.log(`    node builders/cli/create-extension.js data-viewer --name "Data Viewer Pro"`);
    console.log('');
    process.exit(0);
  }

  const options = parseArgs(args);
  createExtension(options);
}

module.exports = createExtension;
