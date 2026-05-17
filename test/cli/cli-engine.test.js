const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const AI_ENGINE_PATH = require.resolve('../../organism-cli/ai-engine');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
let cleanupPaths = [];
let restoreFns = [];

describe('RegisterAIEngine', () => {
  let engine;

  beforeEach(() => {
    cleanupPaths = [];
    restoreFns = [];
    const RegisterAIEngine = loadEngine();
    engine = new RegisterAIEngine(REPO_ROOT);
  });

  afterEach(() => {
    restoreFns.reverse().forEach(restore => restore());
    cleanupPaths.forEach(target => fs.rmSync(target, { recursive: true, force: true }));
    delete require.cache[AI_ENGINE_PATH];
  });

  describe('scan()', () => {
    it('should discover extensions', () => {
      const result = engine.scan();
      assert.ok(Array.isArray(result));
      assert.ok(result.length >= 26, `Expected >=26 extensions, found ${result.length}`);
    });

    it('should populate extension metadata', () => {
      engine.scan();
      for (const ext of engine.extensions) {
        assert.ok(ext.slug, 'Missing slug');
        assert.ok(ext.path, 'Missing path');
        assert.ok(ext.name, 'Missing name');
      }
    });

    it('should return an empty list when the extensions directory is missing', () => {
      const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gptrepo-ai-engine-missing-'));
      cleanupPaths.push(repoRoot);

      const RegisterAIEngine = loadEngine();
      const localEngine = new RegisterAIEngine(repoRoot);
      const result = captureConsole(() => localEngine.scan());

      assert.deepEqual(result, []);
      assert.deepEqual(localEngine.extensions, []);
    });

    it('should keep invalid manifests with error metadata', () => {
      const repoRoot = createTempRepo();
      createExtension(repoRoot, 'valid-extension', {
        manifest_version: 3,
        name: 'Valid Extension',
        version: '1.2.3',
        description: 'A valid test extension.',
        background: { service_worker: 'background.js' },
      }, ['background.js']);
      createExtension(repoRoot, 'broken-extension', '{invalid json');

      const RegisterAIEngine = loadEngine();
      const localEngine = new RegisterAIEngine(repoRoot);
      const result = captureConsole(() => localEngine.scan());
      const broken = result.find(ext => ext.slug === 'broken-extension');

      assert.equal(result.length, 2);
      assert.equal(broken.valid, false);
      assert.equal(broken.manifest, null);
      assert.equal(broken.version, '?');
      assert.match(broken.errors[0], /Invalid manifest\.json/);
    });
  });

  describe('validate()', () => {
    it('should validate all scanned extensions', () => {
      engine.scan();
      const result = engine.validate();
      assert.ok(typeof result.valid === 'number');
      assert.ok(typeof result.invalid === 'number');
      assert.ok(result.valid > 0, 'No valid extensions found');
    });

    it('should mark extensions with manifest_version 3 as valid', () => {
      engine.scan();
      engine.validate();
      const validExts = engine.extensions.filter(e => e.valid);
      for (const ext of validExts) {
        assert.equal(ext.manifest.manifest_version, 3);
      }
    });

    it('should report invalid manifests, missing required fields, and missing files', () => {
      const repoRoot = createTempRepo();
      createExtension(repoRoot, 'valid-extension', {
        manifest_version: 3,
        name: 'Valid Extension',
        version: '1.0.0',
        description: 'A valid test extension.',
        background: { service_worker: 'background.js' },
      }, ['background.js']);
      createExtension(repoRoot, 'broken-json', '{invalid json');
      createExtension(repoRoot, 'missing-fields', {
        manifest_version: 2,
        description: 'Missing required fields.',
      });
      createExtension(repoRoot, 'missing-background', {
        manifest_version: 3,
        name: 'Missing Background',
        version: '1.0.0',
        description: 'References a background file that is missing.',
        background: { service_worker: 'background.js' },
      });
      createExtension(repoRoot, 'missing-content', {
        manifest_version: 3,
        name: 'Missing Content',
        version: '1.0.0',
        description: 'References a content script that is missing.',
        content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
      });

      const RegisterAIEngine = loadEngine();
      const localEngine = new RegisterAIEngine(repoRoot);
      captureConsole(() => localEngine.scan());
      const summary = captureConsole(() => localEngine.validate());

      assert.deepEqual(summary, { valid: 1, invalid: 4 });
      assert.deepEqual(findExtension(localEngine, 'valid-extension').errors, []);
      assert.deepEqual(findExtension(localEngine, 'broken-json').errors, ['No manifest.json or invalid JSON']);
      assert.deepEqual(findExtension(localEngine, 'missing-fields').errors, [
        'manifest_version must be 3',
        'Missing "name"',
        'Missing "version"',
        'No background.service_worker or content_scripts',
      ]);
      assert.deepEqual(findExtension(localEngine, 'missing-background').errors, ['Missing: background.js']);
      assert.deepEqual(findExtension(localEngine, 'missing-content').errors, ['Missing: content.js']);
    });
  });

  describe('detectBrowser()', () => {
    it('should not throw', () => {
      assert.doesNotThrow(() => engine.detectBrowser());
    });

    it('should return browser info or null', () => {
      const result = engine.detectBrowser();
      if (result) {
        assert.ok(result.name);
        assert.ok(result.path);
      }
    });

    it('should discover browsers returned by which on linux', () => {
      patch(childProcess, 'execSync', command => {
        if (command.includes('which chromium')) {
          return '/custom/bin/chromium\n';
        }

        throw new Error('not found');
      });
      patch(os, 'platform', () => 'linux');
      patch(fs, 'existsSync', target => target === '/custom/bin/chromium');

      const RegisterAIEngine = loadEngine();
      const localEngine = new RegisterAIEngine(REPO_ROOT);
      const result = captureConsole(() => localEngine.detectBrowser());

      assert.deepEqual(result, { name: 'Chromium', path: '/custom/bin/chromium' });
      assert.equal(localEngine.browser, '/custom/bin/chromium');
      assert.equal(localEngine.browserName, 'Chromium');
    });

    it('should return null when no supported browser is available', () => {
      patch(childProcess, 'execSync', () => {
        throw new Error('not found');
      });
      patch(os, 'platform', () => 'linux');
      patch(fs, 'existsSync', () => false);

      const RegisterAIEngine = loadEngine();
      const localEngine = new RegisterAIEngine(REPO_ROOT);
      const result = captureConsole(() => localEngine.detectBrowser());

      assert.equal(result, null);
      assert.equal(localEngine.browser, null);
      assert.equal(localEngine.browserName, '');
    });
  });

  describe('status()', () => {
    it('should not throw when called after scan', () => {
      engine.scan();
      engine.validate();
      assert.doesNotThrow(() => engine.status());
    });

    it('should auto-scan and report invalid extension counts', () => {
      let scanCalled = false;
      engine.scan = () => {
        scanCalled = true;
        engine.extensions = [
          { valid: true },
          { valid: false },
        ];
        return engine.extensions;
      };

      captureConsole(() => engine.status());

      assert.equal(scanCalled, true);
    });
  });

  describe('list()', () => {
    it('should not throw when called after scan', () => {
      engine.scan();
      engine.validate();
      assert.doesNotThrow(() => engine.list());
    });

    it('should auto-scan and print errors for invalid extensions', () => {
      let scanCalled = false;
      engine.scan = () => {
        scanCalled = true;
        engine.extensions = [
          { name: 'Healthy', version: '1.0.0', valid: true, errors: [] },
          { name: 'Broken', version: '1.0.0', valid: false, errors: ['Missing background.js'] },
        ];
        return engine.extensions;
      };

      captureConsole(() => engine.list());

      assert.equal(scanCalled, true);
    });
  });

  describe('install()', () => {
    it('should return false when there are no valid extensions to install', () => {
      engine.extensions = [{ valid: false, path: '/tmp/invalid', errors: ['bad manifest'] }];

      const result = captureConsole(() => engine.install());

      assert.equal(result, false);
    });

    it('should return false and print manual loading instructions when no browser is detected', () => {
      engine.extensions = [
        { valid: true, path: '/tmp/one' },
        { valid: true, path: '/tmp/two' },
      ];
      engine.browser = null;

      const messages = [];
      const result = captureConsole(() => engine.install(), messages);

      assert.equal(result, false);
      assert.equal(messages.some(line => line.includes('chrome://extensions')), true);
    });

    it('should launch the detected browser with only valid extensions', () => {
      const spawnCalls = [];
      patch(childProcess, 'spawn', (...args) => {
        spawnCalls.push(args);
        return { unref() {} };
      });

      const RegisterAIEngine = loadEngine();
      const localEngine = new RegisterAIEngine(REPO_ROOT);
      localEngine.extensions = [
        { valid: true, path: '/tmp/alpha' },
        { valid: false, path: '/tmp/skip' },
        { valid: true, path: '/tmp/beta' },
      ];
      localEngine.browser = '/usr/bin/chromium';
      localEngine.browserName = 'Chromium';

      const result = captureConsole(() => localEngine.install());

      assert.equal(result, true);
      assert.equal(spawnCalls.length, 1);
      assert.equal(spawnCalls[0][0], '/usr/bin/chromium');
      assert.deepEqual(spawnCalls[0][1], ['--load-extension=/tmp/alpha,/tmp/beta']);
      assert.deepEqual(spawnCalls[0][2], { detached: true, stdio: 'ignore' });
    });
  });

  describe('runFullPipeline()', () => {
    it('should execute the pipeline steps in order', () => {
      const steps = [];
      engine.banner = () => steps.push('banner');
      engine.scan = () => steps.push('scan');
      engine.validate = () => steps.push('validate');
      engine.detectBrowser = () => steps.push('detectBrowser');
      engine.install = () => steps.push('install');
      engine.status = () => steps.push('status');
      engine.log = (icon, message) => steps.push(`${icon} ${message}`);

      captureConsole(() => engine.runFullPipeline());

      assert.deepEqual(steps, [
        'banner',
        'scan',
        'validate',
        'detectBrowser',
        'install',
        'status',
        '💓 Heartbeat: 873ms · φ = 1.618034',
      ]);
    });
  });
});

function loadEngine() {
  delete require.cache[AI_ENGINE_PATH];
  return require(AI_ENGINE_PATH);
}

function createTempRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gptrepo-ai-engine-'));
  fs.mkdirSync(path.join(repoRoot, 'extensions'), { recursive: true });
  cleanupPaths.push?.(repoRoot);
  return repoRoot;
}

function createExtension(repoRoot, slug, manifest, files = []) {
  const extensionDir = path.join(repoRoot, 'extensions', slug);
  fs.mkdirSync(extensionDir, { recursive: true });

  if (manifest !== undefined) {
    const content = typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2);
    fs.writeFileSync(path.join(extensionDir, 'manifest.json'), content);
  }

  for (const file of files) {
    const filePath = path.join(extensionDir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '// test fixture\n');
  }
}

function findExtension(engineInstance, slug) {
  return engineInstance.extensions.find(ext => ext.slug === slug);
}

function captureConsole(fn, messages = []) {
  const originalLog = console.log;
  console.log = (...args) => {
    messages.push(args.join(' '));
  };

  try {
    return fn();
  } finally {
    console.log = originalLog;
  }
}

function patch(target, property, replacement) {
  const original = target[property];
  target[property] = replacement;
  restoreFns.push(() => {
    target[property] = original;
  });
}
