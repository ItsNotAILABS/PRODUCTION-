'use strict';

/**
 * Protocol Loader — shared agent utility.
 *
 * Every agent calls loadProtocols(manifest) at boot to bind its protocol
 * suite. The loader resolves protocol paths relative to the repo root,
 * requires them, and returns a map keyed by protocol shortname.
 *
 * If a protocol fails to load (missing file, syntax error) it is logged
 * and skipped — the agent boots with whatever it can, never hard-crashes.
 */

const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROT_DIR  = path.join(REPO_ROOT, 'protocols');

/**
 * Load a set of named protocols.
 * @param {Object} manifest  { shortname: 'filename-without-extension.js', ... }
 * @returns {Object}         { shortname: module | null }
 */
function loadProtocols(manifest) {
  const loaded = {};
  for (const [name, file] of Object.entries(manifest)) {
    const full = path.isAbsolute(file) ? file : path.join(PROT_DIR, file);
    try {
      loaded[name] = require(full);
    } catch (err) {
      console.warn(`[protocol-loader] Could not load ${name} (${file}): ${err.message}`);
      loaded[name] = null;
    }
  }
  return loaded;
}

/**
 * Call a method on a loaded protocol module if it exists.
 * @param {Object|null} mod     protocol module
 * @param {string}      method  method name
 * @param {...any}      args
 * @returns {any}
 */
function invoke(mod, method, ...args) {
  if (!mod || typeof mod[method] !== 'function') return null;
  try { return mod[method](...args); } catch { return null; }
}

/**
 * List all .js protocol files in the protocols/ directory.
 * Useful for agents that want to self-discover available protocols.
 */
function discoverAll() {
  const fs = require('fs');
  return fs.readdirSync(PROT_DIR)
    .filter(f => f.endsWith('.js') && f !== 'index.js')
    .map(f => ({
      file: f,
      name: f.replace('.js', ''),
      path: path.join(PROT_DIR, f),
    }));
}

module.exports = { loadProtocols, invoke, discoverAll, PROT_DIR };
