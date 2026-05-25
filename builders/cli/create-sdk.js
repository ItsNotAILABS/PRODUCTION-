#!/usr/bin/env node

/**
 * create-sdk — CLI Scaffolding for SDK Packages
 *
 * Generates a new SDK package with all required files:
 * - package.json (with proper exports)
 * - src/index.js (entry point)
 * - README.md
 * - Sample source files
 *
 * Usage:
 *   node builders/cli/create-sdk.js my-sdk
 *   node builders/cli/create-sdk.js my-sdk --preset organism
 *
 * Options:
 *   --preset <name>   Use preset: minimal, standard, organism (default: standard)
 *   --name <name>     Package name (defaults to @medina/<slug>)
 *   --description     SDK description
 */

'use strict';

const fs = require('fs');
const path = require('path');
const SDKBuilder = require('../patterns/sdk-builder');

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
  indexJs: `/**
 * {{name}} — Entry Point
 *
 * {{description}}
 */

{{exports}}
`,

  coreModuleJs: `/**
 * {{moduleName}} — Core Module
 *
 * Part of {{name}}
 */

'use strict';

/**
 * {{className}} class
 */
export class {{className}} {
  constructor(options = {}) {
    this.options = options;
    this.initialized = false;
  }

  /**
   * Initialize the {{className}}
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    // Initialization logic here
    this.initialized = true;
  }

  /**
   * Check if initialized
   * @returns {boolean}
   */
  isReady() {
    return this.initialized;
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      initialized: this.initialized,
      options: this.options,
    };
  }
}

export default {{className}};
`,

  readmeMd: `# {{name}}

{{description}}

## Installation

\`\`\`bash
npm install {{packageName}}
\`\`\`

## Usage

\`\`\`javascript
import { {{className}} } from '{{packageName}}';

const instance = new {{className}}({
  // options
});

await instance.init();
console.log(instance.isReady()); // true
\`\`\`

## API

### {{className}}

#### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| - | - | - |

#### Methods

- \`init()\` — Initialize the SDK
- \`isReady()\` — Check if initialized
- \`getState()\` — Get current state

## License

MIT
`,

  testJs: `/**
 * {{name}} — Tests
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { {{className}} } from '../src/index.js';

describe('{{className}}', () => {
  let instance;

  beforeEach(() => {
    instance = new {{className}}();
  });

  it('should create instance', () => {
    assert.ok(instance);
  });

  it('should not be initialized by default', () => {
    assert.strictEqual(instance.isReady(), false);
  });

  it('should initialize', async () => {
    await instance.init();
    assert.strictEqual(instance.isReady(), true);
  });

  it('should return state', () => {
    const state = instance.getState();
    assert.ok(state);
    assert.strictEqual(state.initialized, false);
  });
});
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

/* ─── Slug to Class Name ────────────────────────────────────── */
function toClassName(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/* ─── Slug to Title ─────────────────────────────────────────── */
function toTitle(slug) {
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

/* ─── Create SDK ────────────────────────────────────────────── */
function createSDK(options) {
  const { slug, preset, name, description } = options;

  if (!slug) {
    console.log(`${c.red}Error: SDK slug is required${c.reset}`);
    console.log(`${c.dim}Usage: node builders/cli/create-sdk.js <slug> [options]${c.reset}`);
    process.exit(1);
  }

  const packageName = name || `@medina/${slug}`;
  const displayName = toTitle(slug);
  const className = toClassName(slug);
  const desc = description || `${displayName} — A Sovereign Organism SDK`;

  // Find repo root
  const repoRoot = process.cwd();
  const sdkDir = path.join(repoRoot, 'sdk');
  const sdkPath = path.join(sdkDir, slug);

  // Check if already exists
  if (fs.existsSync(sdkPath)) {
    console.log(`${c.red}Error: SDK "${slug}" already exists at ${sdkPath}${c.reset}`);
    process.exit(1);
  }

  console.log('');
  console.log(`${c.bold}${c.cyan}  🏗  Creating SDK: ${displayName}${c.reset}`);
  console.log('');

  // Build package.json
  const builder = new SDKBuilder()
    .setName(packageName)
    .setVersion('1.0.0')
    .setDescription(desc)
    .usePreset(preset)
    .setRepository('git', 'git+https://github.com/FreddyCreates/potential-succotash.git', `sdk/${slug}`);

  // Add exports based on preset
  if (preset === 'minimal') {
    builder.addExport('.', './src/index.js');
  } else {
    builder.addExport('.', './src/index.js');
    builder.addExport('./core', './src/core.js');
  }

  const packageJson = builder.build();

  // Template variables
  const vars = {
    name: displayName,
    packageName,
    className,
    moduleName: displayName,
    description: desc,
    slug,
  };

  // Create directory structure
  console.log(`  ${c.cyan}Creating directory:${c.reset} ${sdkPath}`);
  fs.mkdirSync(sdkPath, { recursive: true });
  fs.mkdirSync(path.join(sdkPath, 'src'), { recursive: true });
  fs.mkdirSync(path.join(sdkPath, 'test'), { recursive: true });

  // Write package.json
  console.log(`  ${c.green}✓${c.reset} package.json`);
  fs.writeFileSync(
    path.join(sdkPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Generate exports string for index.js
  const exportLines = Object.entries(packageJson.exports)
    .filter(([key]) => key !== '.')
    .map(([key, value]) => {
      const name = key.replace('./', '').replace(/-/g, '_');
      const file = value.replace('./src/', './').replace('.js', '');
      return `export * from '${file}.js';`;
    });

  // Add main export
  exportLines.unshift(`export { ${className} } from './core.js';`);

  vars.exports = exportLines.join('\n');

  // Write src/index.js
  console.log(`  ${c.green}✓${c.reset} src/index.js`);
  fs.writeFileSync(
    path.join(sdkPath, 'src', 'index.js'),
    processTemplate(templates.indexJs, vars)
  );

  // Write src/core.js
  console.log(`  ${c.green}✓${c.reset} src/core.js`);
  fs.writeFileSync(
    path.join(sdkPath, 'src', 'core.js'),
    processTemplate(templates.coreModuleJs, vars)
  );

  // Write README.md
  console.log(`  ${c.green}✓${c.reset} README.md`);
  fs.writeFileSync(
    path.join(sdkPath, 'README.md'),
    processTemplate(templates.readmeMd, vars)
  );

  // Write test file
  console.log(`  ${c.green}✓${c.reset} test/index.test.js`);
  fs.writeFileSync(
    path.join(sdkPath, 'test', 'index.test.js'),
    processTemplate(templates.testJs, vars)
  );

  console.log('');
  console.log(`${c.bold}${c.green}  ✓ SDK created successfully!${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Location:${c.reset}    ${sdkPath}`);
  console.log(`  ${c.dim}Package:${c.reset}     ${packageName}`);
  console.log(`  ${c.dim}Preset:${c.reset}      ${preset}`);
  console.log('');
  console.log(`  ${c.dim}Next steps:${c.reset}`);
  console.log(`    1. ${c.cyan}cd ${sdkPath}${c.reset}`);
  console.log(`    2. Add your SDK logic to ${c.cyan}src/core.js${c.reset}`);
  console.log(`    3. Run tests: ${c.cyan}node --test test/*.test.js${c.reset}`);
  console.log('');

  return sdkPath;
}

/* ─── CLI Entry Point ───────────────────────────────────────── */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log(`${c.bold}${c.cyan}  create-sdk — Scaffold a new SDK package${c.reset}`);
    console.log('');
    console.log(`  ${c.bold}Usage:${c.reset}`);
    console.log(`    node builders/cli/create-sdk.js <slug> [options]`);
    console.log('');
    console.log(`  ${c.bold}Options:${c.reset}`);
    console.log(`    --preset <name>      Preset: minimal, standard, organism (default: standard)`);
    console.log(`    --name <name>        Package name (default: @medina/<slug>)`);
    console.log(`    --description <d>    SDK description`);
    console.log(`    --help, -h           Show this help`);
    console.log('');
    console.log(`  ${c.bold}Examples:${c.reset}`);
    console.log(`    node builders/cli/create-sdk.js neural-core`);
    console.log(`    node builders/cli/create-sdk.js data-bridge --preset organism`);
    console.log(`    node builders/cli/create-sdk.js analytics --name "@medina/analytics-sdk"`);
    console.log('');
    process.exit(0);
  }

  const options = parseArgs(args);
  createSDK(options);
}

module.exports = createSDK;
