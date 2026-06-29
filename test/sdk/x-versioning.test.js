/**
 * Test suite: X Versioning SDK (XVersionRegistry, XVersionTag, XChangelog)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { XVersionRegistry }          from '../../sdk/x-versioning/src/x-version-registry.js';
import { XVersionTag }               from '../../sdk/x-versioning/src/x-version-tag.js';
import { XChangelog, CHANGE_TYPE }   from '../../sdk/x-versioning/src/x-changelog.js';

// ─── XVersionTag ──────────────────────────────────────────────────────────────
describe('XVersionTag', () => {
  it('parses a valid semver', () => {
    const tag = new XVersionTag('1.2.3');
    assert.equal(tag.major, 1);
    assert.equal(tag.minor, 2);
    assert.equal(tag.patch, 3);
  });

  it('parses prerelease', () => {
    const tag = new XVersionTag('2.0.0-beta.1');
    assert.equal(tag.prerelease, 'beta.1');
  });

  it('throws on invalid semver', () => {
    assert.throws(() => new XVersionTag('not-a-version'), /Invalid semver/);
  });

  it('isNewerThan compares correctly', () => {
    const v2 = new XVersionTag('2.0.0');
    const v1 = new XVersionTag('1.9.9');
    assert.ok(v2.isNewerThan(v1));
    assert.ok(!v1.isNewerThan(v2));
  });

  it('equals detects identical version', () => {
    assert.ok(new XVersionTag('1.0.0').equals(new XVersionTag('1.0.0')));
  });

  it('bump patch', () => {
    const t = new XVersionTag('1.2.3').bump('patch');
    assert.equal(t.toString(), '1.2.4');
  });

  it('bump minor resets patch', () => {
    const t = new XVersionTag('1.2.3').bump('minor');
    assert.equal(t.toString(), '1.3.0');
  });

  it('bump major resets minor and patch', () => {
    const t = new XVersionTag('1.2.3').bump('major');
    assert.equal(t.toString(), '2.0.0');
  });

  it('isValid returns false for garbage', () => {
    assert.equal(XVersionTag.isValid('abc'), false);
  });

  it('toString round-trips', () => {
    const raw = '3.1.4-alpha+build.1';
    const tag = new XVersionTag(raw);
    assert.equal(tag.toString(), raw);
  });
});

// ─── XChangelog ───────────────────────────────────────────────────────────────
describe('XChangelog', () => {
  it('appends an entry and returns hash', () => {
    const cl = new XChangelog();
    const { id, hash } = cl.append({ component: 'api', version: '1.0.0', type: CHANGE_TYPE.FEAT, summary: 'initial release' });
    assert.ok(id.startsWith('chg-'));
    assert.equal(hash.length, 64);
  });

  it('chain is valid after multiple entries', () => {
    const cl = new XChangelog();
    cl.append({ component: 'api', version: '1.0.0', type: CHANGE_TYPE.FEAT, summary: 'init' });
    cl.append({ component: 'api', version: '1.0.1', type: CHANGE_TYPE.FIX,  summary: 'patch' });
    assert.ok(cl.verify().valid);
  });

  it('query filters by type', () => {
    const cl = new XChangelog();
    cl.append({ component: 'x', version: '1.0.0', type: CHANGE_TYPE.FEAT, summary: 'feat' });
    cl.append({ component: 'x', version: '1.0.1', type: CHANGE_TYPE.FIX,  summary: 'fix'  });
    const fixes = cl.query({ type: CHANGE_TYPE.FIX });
    assert.equal(fixes.length, 1);
  });

  it('render returns non-empty string', () => {
    const cl = new XChangelog();
    cl.append({ component: 'sdk', version: '1.0.0', type: CHANGE_TYPE.FEAT, summary: 'launched' });
    const text = cl.render('sdk');
    assert.ok(text.includes('sdk'));
  });

  it('length reflects entry count', () => {
    const cl = new XChangelog();
    cl.append({ component: 'c', version: '1.0.0', type: CHANGE_TYPE.CHORE, summary: 'init' });
    assert.equal(cl.length, 1);
  });
});

// ─── XVersionRegistry ─────────────────────────────────────────────────────────
describe('XVersionRegistry', () => {
  it('registers a component version', () => {
    const reg = new XVersionRegistry();
    reg.register('x-ecosystem', '1.0.0');
    assert.equal(reg.current('x-ecosystem').toString(), '1.0.0');
  });

  it('updates current on re-register', () => {
    const reg = new XVersionRegistry();
    reg.register('svc', '1.0.0');
    reg.register('svc', '1.1.0');
    assert.equal(reg.current('svc').toString(), '1.1.0');
  });

  it('history tracks all versions', () => {
    const reg = new XVersionRegistry();
    reg.register('svc', '1.0.0');
    reg.register('svc', '1.1.0');
    assert.equal(reg.history('svc').length, 2);
  });

  it('satisfies returns true when at or above min', () => {
    const reg = new XVersionRegistry();
    reg.register('lib', '2.0.0');
    assert.ok(reg.satisfies('lib', '1.5.0'));
    assert.ok(!reg.satisfies('lib', '3.0.0'));
  });

  it('outdated lists components below threshold', () => {
    const reg = new XVersionRegistry();
    reg.register('a', '1.0.0');
    reg.register('b', '3.0.0');
    const old = reg.outdated('2.0.0');
    assert.ok(old.includes('a'));
    assert.ok(!old.includes('b'));
  });

  it('snapshot includes all components', () => {
    const reg = new XVersionRegistry();
    reg.registerAll([
      { component: 'x', version: '1.0.0' },
      { component: 'y', version: '2.0.0' },
    ]);
    const snap = reg.snapshot();
    assert.ok('x' in snap);
    assert.ok('y' in snap);
  });

  it('report includes changelog length and chain validity', () => {
    const reg = new XVersionRegistry();
    reg.register('c', '1.0.0');
    const report = reg.report();
    assert.ok(report.changelog >= 1);
    assert.ok(report.chainValid);
  });

  it('returns null for unknown component', () => {
    const reg = new XVersionRegistry();
    assert.equal(reg.current('nonexistent'), null);
  });
});
