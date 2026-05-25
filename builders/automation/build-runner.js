/**
 * BuildRunner — Automated Build Orchestration
 *
 * Provides a unified interface for running build tasks:
 * - Extension builds
 * - SDK builds
 * - Icon generation
 * - Release bundling
 *
 * Example:
 *   const runner = new BuildRunner(repoRoot);
 *
 *   await runner.buildAll();
 *   await runner.buildExtension('jarvis');
 *   await runner.buildSDK('organism-runtime-sdk');
 */

'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

class BuildRunner {
  constructor(repoRoot = process.cwd()) {
    this.repoRoot = repoRoot;
    this.extensionsDir = path.join(repoRoot, 'extensions');
    this.sdkDir = path.join(repoRoot, 'sdk');
    this.distDir = path.join(repoRoot, 'dist');
    this.scriptsDir = path.join(repoRoot, 'scripts');
    this.startTime = Date.now();
    this.results = [];
  }

  /**
   * Log a message
   * @param {string} icon - Icon to display
   * @param {string} msg - Message
   */
  log(icon, msg) {
    console.log(`  ${icon} ${msg}`);
  }

  /**
   * Log success
   * @param {string} msg - Message
   */
  success(msg) {
    console.log(`  ${c.green}✓${c.reset} ${msg}`);
  }

  /**
   * Log warning
   * @param {string} msg - Message
   */
  warn(msg) {
    console.log(`  ${c.yellow}⚠${c.reset} ${msg}`);
  }

  /**
   * Log error
   * @param {string} msg - Message
   */
  error(msg) {
    console.log(`  ${c.red}✗${c.reset} ${msg}`);
  }

  /**
   * Execute a command
   * @param {string} cmd - Command to execute
   * @param {Object} options - Options
   * @returns {{ success: boolean, output: string }}
   */
  exec(cmd, options = {}) {
    const cwd = options.cwd || this.repoRoot;
    const silent = options.silent || false;

    try {
      const output = execSync(cmd, {
        cwd,
        encoding: 'utf8',
        stdio: silent ? 'pipe' : 'inherit',
      });
      return { success: true, output: output || '' };
    } catch (err) {
      return { success: false, output: err.message };
    }
  }

  /**
   * List all extensions
   * @returns {string[]}
   */
  listExtensions() {
    if (!fs.existsSync(this.extensionsDir)) {
      return [];
    }

    return fs.readdirSync(this.extensionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => fs.existsSync(path.join(this.extensionsDir, d.name, 'manifest.json')))
      .map(d => d.name);
  }

  /**
   * List all SDKs
   * @returns {string[]}
   */
  listSDKs() {
    if (!fs.existsSync(this.sdkDir)) {
      return [];
    }

    return fs.readdirSync(this.sdkDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => fs.existsSync(path.join(this.sdkDir, d.name, 'package.json')))
      .map(d => d.name);
  }

  /**
   * Build a specific extension
   * @param {string} name - Extension name
   * @returns {{ success: boolean, name: string, duration: number }}
   */
  async buildExtension(name) {
    const start = Date.now();
    const extPath = path.join(this.extensionsDir, name);

    if (!fs.existsSync(extPath)) {
      return { success: false, name, duration: 0, error: 'Extension not found' };
    }

    this.log('🔨', `Building extension: ${c.cyan}${name}${c.reset}`);

    // Check if extension has its own package.json with build script
    const pkgPath = path.join(extPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts && pkg.scripts.build) {
          // Install dependencies and build
          this.log('📦', `  Installing dependencies...`);
          const installResult = this.exec('npm install', { cwd: extPath, silent: true });
          if (!installResult.success) {
            this.error(`  Failed to install dependencies`);
            return { success: false, name, duration: Date.now() - start, error: 'npm install failed' };
          }

          this.log('🏗', `  Running build...`);
          const buildResult = this.exec('npm run build', { cwd: extPath, silent: true });
          if (!buildResult.success) {
            this.error(`  Build failed`);
            return { success: false, name, duration: Date.now() - start, error: 'npm run build failed' };
          }

          this.success(`  Built ${name}`);
          return { success: true, name, duration: Date.now() - start };
        }
      } catch { /* ignore */ }
    }

    // Extension without build script - just validate manifest
    const manifestPath = path.join(extPath, 'manifest.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.manifest_version !== 3) {
        this.warn(`  ${name} is not Manifest V3`);
      }
      this.success(`  Validated ${name}`);
      return { success: true, name, duration: Date.now() - start };
    } catch (err) {
      this.error(`  Invalid manifest: ${err.message}`);
      return { success: false, name, duration: Date.now() - start, error: err.message };
    }
  }

  /**
   * Build all extensions
   * @returns {{ success: number, failed: number, results: Object[] }}
   */
  async buildAllExtensions() {
    console.log('');
    console.log(`${c.bold}${c.cyan}  🏗  Building All Extensions${c.reset}`);
    console.log('');

    const extensions = this.listExtensions();
    let success = 0;
    let failed = 0;
    const results = [];

    for (const ext of extensions) {
      const result = await this.buildExtension(ext);
      results.push(result);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    console.log('');
    console.log(`  ${c.green}${success}${c.reset} built · ${c.red}${failed}${c.reset} failed · ${extensions.length} total`);

    return { success, failed, results };
  }

  /**
   * Build a specific SDK
   * @param {string} name - SDK name
   * @returns {{ success: boolean, name: string, duration: number }}
   */
  async buildSDK(name) {
    const start = Date.now();
    const sdkPath = path.join(this.sdkDir, name);

    if (!fs.existsSync(sdkPath)) {
      return { success: false, name, duration: 0, error: 'SDK not found' };
    }

    this.log('🔨', `Building SDK: ${c.cyan}${name}${c.reset}`);

    const pkgPath = path.join(sdkPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      this.error(`  No package.json found`);
      return { success: false, name, duration: Date.now() - start, error: 'No package.json' };
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      // Install dependencies if needed
      const nodeModulesPath = path.join(sdkPath, 'node_modules');
      if (!fs.existsSync(nodeModulesPath) && (pkg.dependencies || pkg.devDependencies)) {
        this.log('📦', `  Installing dependencies...`);
        const installResult = this.exec('npm install', { cwd: sdkPath, silent: true });
        if (!installResult.success) {
          this.warn(`  npm install failed (may not be required)`);
        }
      }

      // Run build if available
      if (pkg.scripts && pkg.scripts.build) {
        this.log('🏗', `  Running build...`);
        const buildResult = this.exec('npm run build', { cwd: sdkPath, silent: true });
        if (!buildResult.success) {
          this.error(`  Build failed`);
          return { success: false, name, duration: Date.now() - start, error: 'npm run build failed' };
        }
      }

      this.success(`  Built ${name}`);
      return { success: true, name, duration: Date.now() - start };
    } catch (err) {
      this.error(`  Error: ${err.message}`);
      return { success: false, name, duration: Date.now() - start, error: err.message };
    }
  }

  /**
   * Build all SDKs
   * @returns {{ success: number, failed: number, results: Object[] }}
   */
  async buildAllSDKs() {
    console.log('');
    console.log(`${c.bold}${c.cyan}  🏗  Building All SDKs${c.reset}`);
    console.log('');

    const sdks = this.listSDKs();
    let success = 0;
    let failed = 0;
    const results = [];

    for (const sdk of sdks) {
      const result = await this.buildSDK(sdk);
      results.push(result);
      if (result.success) {
        success++;
      } else {
        failed++;
      }
    }

    console.log('');
    console.log(`  ${c.green}${success}${c.reset} built · ${c.red}${failed}${c.reset} failed · ${sdks.length} total`);

    return { success, failed, results };
  }

  /**
   * Generate icons for all extensions
   * @returns {{ success: boolean }}
   */
  async generateIcons() {
    console.log('');
    console.log(`${c.bold}${c.cyan}  🎨  Generating Icons${c.reset}`);
    console.log('');

    const scriptPath = path.join(this.scriptsDir, 'generate-icons.js');
    if (!fs.existsSync(scriptPath)) {
      this.warn('generate-icons.js not found');
      return { success: false };
    }

    const result = this.exec(`node ${scriptPath}`, { silent: true });
    if (result.success) {
      this.success('Icons generated');
    } else {
      this.error('Icon generation failed');
    }

    return { success: result.success };
  }

  /**
   * Run linting
   * @returns {{ success: boolean }}
   */
  async lint() {
    console.log('');
    console.log(`${c.bold}${c.cyan}  🔍  Running Lint${c.reset}`);
    console.log('');

    const result = this.exec('npm run lint', { silent: true });
    if (result.success) {
      this.success('Lint passed');
    } else {
      this.error('Lint failed');
    }

    return { success: result.success };
  }

  /**
   * Run tests
   * @returns {{ success: boolean }}
   */
  async test() {
    console.log('');
    console.log(`${c.bold}${c.cyan}  🧪  Running Tests${c.reset}`);
    console.log('');

    const result = this.exec('npm test', { silent: true });
    if (result.success) {
      this.success('Tests passed');
    } else {
      this.error('Tests failed');
    }

    return { success: result.success };
  }

  /**
   * Create release bundle
   * @returns {{ success: boolean, path: string }}
   */
  async bundle() {
    console.log('');
    console.log(`${c.bold}${c.cyan}  📦  Creating Bundle${c.reset}`);
    console.log('');

    const scriptPath = path.join(this.scriptsDir, 'bundle-release.js');
    if (!fs.existsSync(scriptPath)) {
      this.warn('bundle-release.js not found');
      return { success: false };
    }

    const result = this.exec(`node ${scriptPath}`, { silent: true });
    if (result.success) {
      this.success('Bundle created');
    } else {
      this.error('Bundle failed');
    }

    return { success: result.success, path: this.distDir };
  }

  /**
   * Build everything
   * @param {Object} options - Build options
   * @returns {{ success: boolean, summary: Object }}
   */
  async buildAll(options = {}) {
    const { lint = true, test = true, icons = true, extensions = true, sdks = true, bundle = false } = options;

    console.log('');
    console.log(`${c.bold}${c.yellow}  ╔═══════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.bold}${c.yellow}  ║  🏗  Build Runner — Full Build                     ║${c.reset}`);
    console.log(`${c.bold}${c.yellow}  ╚═══════════════════════════════════════════════════╝${c.reset}`);

    const summary = {
      lint: null,
      test: null,
      icons: null,
      extensions: null,
      sdks: null,
      bundle: null,
      duration: 0,
    };

    const start = Date.now();

    // Lint
    if (lint) {
      summary.lint = await this.lint();
      if (!summary.lint.success && !options.continueOnError) {
        return { success: false, summary };
      }
    }

    // Test
    if (test) {
      summary.test = await this.test();
      if (!summary.test.success && !options.continueOnError) {
        return { success: false, summary };
      }
    }

    // Icons
    if (icons) {
      summary.icons = await this.generateIcons();
    }

    // Extensions
    if (extensions) {
      summary.extensions = await this.buildAllExtensions();
    }

    // SDKs
    if (sdks) {
      summary.sdks = await this.buildAllSDKs();
    }

    // Bundle
    if (bundle) {
      summary.bundle = await this.bundle();
    }

    summary.duration = Date.now() - start;

    // Final summary
    console.log('');
    console.log(`${c.bold}${c.cyan}  ═══════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}  Build Summary${c.reset}`);
    console.log(`${c.dim}  ───────────────────────────────────────────────────${c.reset}`);

    if (summary.lint) {
      console.log(`  Lint:       ${summary.lint.success ? c.green + '✓ passed' : c.red + '✗ failed'}${c.reset}`);
    }
    if (summary.test) {
      console.log(`  Tests:      ${summary.test.success ? c.green + '✓ passed' : c.red + '✗ failed'}${c.reset}`);
    }
    if (summary.icons) {
      console.log(`  Icons:      ${summary.icons.success ? c.green + '✓ generated' : c.yellow + '⚠ skipped'}${c.reset}`);
    }
    if (summary.extensions) {
      console.log(`  Extensions: ${c.green}${summary.extensions.success}${c.reset} built · ${c.red}${summary.extensions.failed}${c.reset} failed`);
    }
    if (summary.sdks) {
      console.log(`  SDKs:       ${c.green}${summary.sdks.success}${c.reset} built · ${c.red}${summary.sdks.failed}${c.reset} failed`);
    }
    if (summary.bundle) {
      console.log(`  Bundle:     ${summary.bundle.success ? c.green + '✓ created' : c.red + '✗ failed'}${c.reset}`);
    }

    console.log(`  Duration:   ${(summary.duration / 1000).toFixed(1)}s`);
    console.log('');

    const overallSuccess = !Object.values(summary)
      .filter(v => v && typeof v === 'object')
      .some(v => v.success === false);

    return { success: overallSuccess, summary };
  }
}

module.exports = BuildRunner;
