/**
 * XVersionRegistry — Central version ledger for all X ecosystem components.
 * Tracks current versions, history, and compatibility matrices.
 */

import XVersionTag from './x-version-tag.js';
import { XChangelog } from './x-changelog.js';

export class XVersionRegistry {
  constructor() {
    this.version   = '1.0.0';
    this.changelog = new XChangelog();
    this.#components = new Map();  // component → { current: XVersionTag, history: XVersionTag[] }
  }

  #components;

  /**
   * Register a component version.
   * @param {string} component  Component identifier (e.g. 'x-ecosystem', 'protocol:sales-intelligence')
   * @param {string} version    Semver string
   * @param {{ author?: string, notes?: string, changeType?: string, breaking?: boolean }} meta
   * @returns {XVersionTag}
   */
  register(component, version, meta = {}) {
    const tag = new XVersionTag(version, { component, author: meta.author, notes: meta.notes });

    const existing = this.#components.get(component);
    if (existing) {
      existing.history.push(existing.current);
      existing.current = tag;
    } else {
      this.#components.set(component, { current: tag, history: [] });
    }

    this.changelog.append({
      component,
      version,
      type:    meta.changeType ?? 'chore',
      summary: meta.notes ?? `Version ${version} registered`,
      author:  meta.author,
      breaking: meta.breaking ?? false,
    });

    return tag;
  }

  /**
   * Register multiple components at once.
   * @param {{ component: string, version: string, meta?: object }[]} entries
   */
  registerAll(entries) {
    return entries.map(({ component, version, meta }) => this.register(component, version, meta));
  }

  /**
   * Get the current version tag for a component.
   * @param {string} component
   * @returns {XVersionTag|null}
   */
  current(component) {
    return this.#components.get(component)?.current ?? null;
  }

  /**
   * Get version history for a component (oldest first).
   * @param {string} component
   * @returns {XVersionTag[]}
   */
  history(component) {
    const rec = this.#components.get(component);
    if (!rec) return [];
    return [...rec.history, rec.current];
  }

  /**
   * List all registered components with their current versions.
   * @returns {{ component: string, version: string, taggedAt: string }[]}
   */
  list() {
    return [...this.#components.entries()].map(([component, { current }]) => ({
      component,
      version:  current.toString(),
      taggedAt: current.taggedAt,
    }));
  }

  /**
   * Check if a component is at or above a minimum version.
   * @param {string} component
   * @param {string} minVersion  Semver string
   * @returns {boolean}
   */
  satisfies(component, minVersion) {
    const current = this.current(component);
    if (!current) return false;
    const min = new XVersionTag(minVersion);
    return !current.isOlderThan(min);
  }

  /**
   * Find all components that are below a given version threshold.
   * @param {string} belowVersion
   * @returns {string[]}
   */
  outdated(belowVersion) {
    const threshold = new XVersionTag(belowVersion);
    return this.list()
      .filter(({ version }) => new XVersionTag(version).isOlderThan(threshold))
      .map(({ component }) => component);
  }

  /**
   * Compatibility snapshot: all components keyed by component name.
   * @returns {object}
   */
  snapshot() {
    const snap = {};
    for (const [component, { current }] of this.#components.entries()) {
      snap[component] = current.toJSON();
    }
    return snap;
  }

  /**
   * Full registry report.
   */
  report() {
    return {
      version:    this.version,
      components: this.#components.size,
      snapshot:   this.snapshot(),
      changelog:  this.changelog.length,
      chainValid: this.changelog.verify().valid,
    };
  }
}

export default XVersionRegistry;
