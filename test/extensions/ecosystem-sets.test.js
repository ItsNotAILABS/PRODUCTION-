const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXT_INDEX = path.resolve(__dirname, '..', '..', 'extensions', 'index.js');

describe('Extensions ecosystem sets', () => {
  it('should define modular ECOSYSTEM_SETS', () => {
    const content = fs.readFileSync(EXT_INDEX, 'utf8');
    assert.match(content, /const\s+ECOSYSTEM_SETS\s*=\s*\[/);
  });

  it('should define at least 5 ecosystem sets', () => {
    const content = fs.readFileSync(EXT_INDEX, 'utf8');
    const setIds = content.match(/id:\s*'SET-[^']+'/g) || [];
    assert.ok(setIds.length >= 5, `Expected at least 5 ecosystem sets, found ${setIds.length}`);
  });

  it('should reference only declared extensions from ecosystem sets', () => {
    const content = fs.readFileSync(EXT_INDEX, 'utf8');

    const extensionIds = new Set(
      (content.match(/id:\s*'EXT-\d+'/g) || []).map((entry) => entry.match(/'([^']+)'/)[1]),
    );

    const setBlocks = [...content.matchAll(/extensionIds:\s*\[([^\]]*)\]/g)];
    assert.ok(setBlocks.length > 0, 'No ecosystem set extensionIds found');

    for (const [, block] of setBlocks) {
      const refs = (block.match(/'EXT-\d+'/g) || []).map((entry) => entry.slice(1, -1));
      for (const ref of refs) {
        assert.ok(extensionIds.has(ref), `Ecosystem set references unknown extension ID: ${ref}`);
      }
    }
  });

  it('should export ecosystem set helpers', () => {
    const content = fs.readFileSync(EXT_INDEX, 'utf8');
    assert.match(content, /\bECOSYSTEM_SETS\b/);
    assert.match(content, /\blistEcosystemSets\b/);
    assert.match(content, /\bgetEcosystemSetById\b/);
    assert.match(content, /\bgetExtensionsByEcosystemSet\b/);
  });
});
