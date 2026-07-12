/**
 * XVersionTag — Parsed, comparable semver tag with metadata.
 * Format: MAJOR.MINOR.PATCH[-prerelease][+build]
 */

export class XVersionTag {
  /**
   * @param {string} version  Semver string e.g. "1.2.3" or "2.0.0-beta.1"
   * @param {{ component?: string, author?: string, notes?: string }} meta
   */
  constructor(version, meta = {}) {
    const parsed = XVersionTag.parse(version);
    if (!parsed) throw new Error(`Invalid semver: ${version}`);

    this.raw        = version;
    this.major      = parsed.major;
    this.minor      = parsed.minor;
    this.patch      = parsed.patch;
    this.prerelease = parsed.prerelease;
    this.build      = parsed.build;
    this.component  = meta.component ?? 'unknown';
    this.author     = meta.author    ?? 'system';
    this.notes      = meta.notes     ?? '';
    this.taggedAt   = new Date().toISOString();
  }

  /**
   * Compare two XVersionTags. Returns negative/zero/positive.
   */
  static compare(a, b) {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    if (a.patch !== b.patch) return a.patch - b.patch;
    // No prerelease > prerelease
    if (!a.prerelease && b.prerelease)  return 1;
    if (a.prerelease  && !b.prerelease) return -1;
    if (a.prerelease  && b.prerelease)  return a.prerelease.localeCompare(b.prerelease);
    return 0;
  }

  isNewerThan(other) { return XVersionTag.compare(this, other) > 0; }
  isOlderThan(other) { return XVersionTag.compare(this, other) < 0; }
  equals(other)      { return XVersionTag.compare(this, other) === 0; }

  /**
   * Returns the next version for a bump type.
   * @param {'major'|'minor'|'patch'} type
   */
  bump(type) {
    if (type === 'major') return new XVersionTag(`${this.major + 1}.0.0`, { component: this.component, author: this.author });
    if (type === 'minor') return new XVersionTag(`${this.major}.${this.minor + 1}.0`, { component: this.component, author: this.author });
    return new XVersionTag(`${this.major}.${this.minor}.${this.patch + 1}`, { component: this.component, author: this.author });
  }

  toString() {
    let v = `${this.major}.${this.minor}.${this.patch}`;
    if (this.prerelease) v += `-${this.prerelease}`;
    if (this.build)      v += `+${this.build}`;
    return v;
  }

  toJSON() {
    return { version: this.toString(), component: this.component, author: this.author, notes: this.notes, taggedAt: this.taggedAt };
  }

  static parse(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([^\+]+))?(?:\+(.+))?$/.exec(String(version));
    if (!m) return null;
    return { major: +m[1], minor: +m[2], patch: +m[3], prerelease: m[4] ?? null, build: m[5] ?? null };
  }

  static isValid(version) { return XVersionTag.parse(version) !== null; }
}

export default XVersionTag;
