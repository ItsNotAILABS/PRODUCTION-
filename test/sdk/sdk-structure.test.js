const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SDK_ROOT = path.resolve(__dirname, '..', '..', 'sdk');

const EXPECTED_SDKS = [
  'ai-model-engines',
  'intelligence-routing-sdk',
  'organism-marketplace',
  'organism-runtime-sdk',
  'sovereign-memory-sdk',
  'document-absorption-engine',
  'enterprise-integration-sdk',
  'frontend-intelligence-models',
  'windows-runtime-sdk',
  'windows-desktop-sdk',
  'register-ai',
];

describe('SDK structure validation', () => {
  it('should have all expected SDK directories', () => {
    for (const sdk of EXPECTED_SDKS) {
      const sdkPath = path.join(SDK_ROOT, sdk);
      assert.ok(fs.existsSync(sdkPath), `Missing SDK directory: ${sdk}`);
    }
  });

  for (const sdk of EXPECTED_SDKS) {
    describe(sdk, () => {
      const sdkPath = path.join(SDK_ROOT, sdk);

      it('should have a package.json', () => {
        const pkgPath = path.join(sdkPath, 'package.json');
        assert.ok(fs.existsSync(pkgPath), `Missing package.json in ${sdk}`);
      });

      it('should have valid JSON in package.json', () => {
        const pkgPath = path.join(sdkPath, 'package.json');
        const raw = fs.readFileSync(pkgPath, 'utf8');
        assert.doesNotThrow(() => JSON.parse(raw));
      });

      it('should have a name in package.json', () => {
        const pkgPath = path.join(sdkPath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        assert.ok(pkg.name, 'Missing name in package.json');
      });

      it('should have a main entry point', () => {
        const pkgPath = path.join(sdkPath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        assert.ok(pkg.main, `Missing "main" in ${sdk}/package.json`);
      });

      it('should have the main entry point file on disk', () => {
        const pkgPath = path.join(sdkPath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.main) {
          const mainPath = path.join(sdkPath, pkg.main);
          assert.ok(fs.existsSync(mainPath), `Main entry point missing: ${pkg.main}`);
        }
      });

      it('should have a license', () => {
        const pkgPath = path.join(sdkPath, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        assert.ok(pkg.license, `Missing license in ${sdk}/package.json`);
      });
    });
  }
});

describe('Extensions index', () => {
  it('should export EXTENSIONS array with 31 entries', async () => {
    const indexPath = path.join(SDK_ROOT, '..', 'extensions', 'index.js');
    assert.ok(fs.existsSync(indexPath));
    const content = fs.readFileSync(indexPath, 'utf8');
    const match = content.match(/id:\s*'EXT-/g);
    assert.ok(match);
    assert.equal(match.length, 31, `Expected 31 extension entries, found ${match.length}`);
  });
});

describe('Protocols index', () => {
  function getProtocolExportTargets(content) {
    return [...content.matchAll(/export\s*\{[^}]+\}\s*from\s+'(\.\/[^']+)'/g)].map((m) => m[1]);
  }

  it('should export protocol modules', () => {
  it('should export protocol definitions', () => {
    const indexPath = path.join(SDK_ROOT, '..', 'protocols', 'index.js');
    assert.ok(fs.existsSync(indexPath));
    const content = fs.readFileSync(indexPath, 'utf8');
    const targets = getProtocolExportTargets(content);
    assert.ok(targets.length > 0, 'No protocol export targets found in protocols/index.js');
    assert.ok(targets.length >= 11, `Expected at least 11 protocol exports, found ${targets.length}`);
  });

  it('should reference existing protocol files', () => {
    const indexPath = path.join(SDK_ROOT, '..', 'protocols', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    const targets = getProtocolExportTargets(content);
    assert.ok(targets.length > 0, 'No protocol export targets found in protocols/index.js');

    for (const target of targets) {
      const protocolPath = path.join(SDK_ROOT, '..', 'protocols', target.replace('./', ''));
      assert.ok(fs.existsSync(protocolPath), `Missing exported protocol file: ${target}`);
    }
  it('should reference every protocol implementation file exported by the index', () => {
    const indexPath = path.join(SDK_ROOT, '..', 'protocols', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    const fromMatches = content.matchAll(/from\s+'\.\/([^']+)'/g);
    const referencedFiles = [...new Set(Array.from(fromMatches, match => match[1]))].sort();
    const protocolsDir = path.join(SDK_ROOT, '..', 'protocols');
    const implementationFiles = fs.readdirSync(protocolsDir)
      .filter(file => file.endsWith('.js'))
      .filter(file => !['index.js', 'native-runtime.js'].includes(file))
      .sort();

    assert.deepEqual(referencedFiles, implementationFiles);
  });
});
