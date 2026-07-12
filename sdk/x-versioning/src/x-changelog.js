/**
 * XChangelog — Append-only, hash-verified change history.
 * Every entry is linked by a prev-hash chain for tamper detection.
 */

import { createHash } from 'crypto';

export const CHANGE_TYPE = Object.freeze({
  FEAT:     'feat',
  FIX:      'fix',
  BREAKING: 'breaking',
  PERF:     'perf',
  REFACTOR: 'refactor',
  DOCS:     'docs',
  CHORE:    'chore',
});

export class XChangelog {
  constructor() {
    this.#entries   = [];
    this.#prevHash  = '0'.repeat(64);
  }

  #entries;
  #prevHash;

  /**
   * Append a changelog entry.
   * @param {{ component: string, version: string, type: string, summary: string, author?: string, breaking?: boolean }} entry
   * @returns {{ id: string, hash: string }}
   */
  append(entry) {
    const id = `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const record = {
      id,
      component: entry.component,
      version:   entry.version,
      type:      entry.type ?? CHANGE_TYPE.CHORE,
      summary:   entry.summary,
      author:    entry.author ?? 'system',
      breaking:  entry.breaking ?? false,
      ts:        new Date().toISOString(),
      prevHash:  this.#prevHash,
    };
    const hash      = this.#hash(record);
    record.hash     = hash;
    this.#prevHash  = hash;
    this.#entries.push(record);
    return { id, hash };
  }

  /**
   * Verify chain integrity.
   * @returns {{ valid: boolean, entries: number, firstBroken?: string }}
   */
  verify() {
    let prev = '0'.repeat(64);
    for (const entry of this.#entries) {
      const { hash, ...rest } = entry;
      if (this.#hash({ ...rest, prevHash: prev }) !== hash) {
        return { valid: false, entries: this.#entries.length, firstBroken: entry.id };
      }
      prev = hash;
    }
    return { valid: true, entries: this.#entries.length };
  }

  /**
   * Query entries.
   * @param {{ component?: string, type?: string, breaking?: boolean, limit?: number }} filter
   */
  query({ component, type, breaking, limit = 100 } = {}) {
    return this.#entries
      .filter((e) => {
        if (component !== undefined && e.component !== component) return false;
        if (type      !== undefined && e.type      !== type)      return false;
        if (breaking  !== undefined && e.breaking  !== breaking)  return false;
        return true;
      })
      .slice(-limit);
  }

  /**
   * Render a human-readable changelog for a component.
   * @param {string} [component]
   * @returns {string}
   */
  render(component) {
    const entries = component ? this.query({ component }) : [...this.#entries];
    if (entries.length === 0) return '(empty changelog)';
    const lines = [`# Changelog${component ? ` — ${component}` : ''}\n`];
    for (const e of entries.slice().reverse()) {
      const breaking = e.breaking ? ' **BREAKING**' : '';
      lines.push(`- [${e.version}] ${e.type.toUpperCase()}${breaking}: ${e.summary}  _(${e.author}, ${e.ts.slice(0, 10)})_`);
    }
    return lines.join('\n');
  }

  get length() { return this.#entries.length; }

  #hash(record) {
    const data = JSON.stringify({ prevHash: record.prevHash, component: record.component, version: record.version, type: record.type, summary: record.summary, ts: record.ts });
    return createHash('sha256').update(data).digest('hex');
  }
}

export default XChangelog;
