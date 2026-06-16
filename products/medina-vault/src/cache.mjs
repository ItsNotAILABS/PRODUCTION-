// cache.mjs — skill memoization cache. SAME skill + SAME input = cached output.
// Saves the wasted re-runs that show up most in real AI sessions: the model
// calls a deterministic skill, forgets, and calls it again. With the cache,
// the second call is O(1) and free. TTL configurable per skill family.
//
// Cache key = sha256(skillName || canonical(input)). Canonical = JSON with
// sorted keys so {a:1,b:2} and {b:2,a:1} hit the same entry.

import { createHash } from 'node:crypto';

const DEFAULT_TTL_MS = 60 * 60 * 1000;    // 1 hour
const MAX_ENTRIES    = 500;

// Skills with side-effects must NEVER be cached (writes, sends, randomness).
const NEVER_CACHE = /^(integrations\.|vault_|skills_register|workflows_run|workspace_|plans_)/;

function canonical(input) {
  if (input == null) return 'null';
  if (typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return '[' + input.map(canonical).join(',') + ']';
  return '{' + Object.keys(input).sort().map(k => JSON.stringify(k) + ':' + canonical(input[k])).join(',') + '}';
}

export class SkillCache {
  constructor() {
    /** @type {Map<string, {result:any, ts:number, hits:number, skill:string}>} */
    this.entries = new Map();
    this.stats = { hits: 0, misses: 0, skips: 0, saved_ms: 0, evicted: 0 };
  }

  loadFromMeta(meta) {
    if (!meta?.skill_cache) return;
    if (meta.skill_cache.entries) for (const [k, v] of Object.entries(meta.skill_cache.entries)) this.entries.set(k, v);
    if (meta.skill_cache.stats)   Object.assign(this.stats, meta.skill_cache.stats);
  }
  toMeta() {
    return { skill_cache: { entries: Object.fromEntries([...this.entries].slice(-MAX_ENTRIES)), stats: this.stats } };
  }

  cacheable(skillName) { return !NEVER_CACHE.test(skillName); }

  _key(skill, input) {
    return createHash('sha256').update(skill + '||' + canonical(input)).digest('hex').slice(0, 24);
  }

  get(skill, input, { ttl = DEFAULT_TTL_MS } = {}) {
    if (!this.cacheable(skill)) { this.stats.skips++; return null; }
    const k = this._key(skill, input);
    const e = this.entries.get(k);
    if (!e) { this.stats.misses++; return null; }
    if (Date.now() - e.ts > ttl) { this.entries.delete(k); this.stats.misses++; return null; }
    e.hits++;
    this.stats.hits++;
    this.stats.saved_ms += e.last_ms || 0;
    return e.result;
  }

  set(skill, input, result, { ms = 0 } = {}) {
    if (!this.cacheable(skill)) return false;
    if (!result?.ok) return false;                // never cache failures
    const k = this._key(skill, input);
    this.entries.set(k, { result, ts: Date.now(), hits: 0, skill, last_ms: ms });
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
      this.stats.evicted++;
    }
    return true;
  }

  clear() { this.entries.clear(); }
  view() {
    return {
      size: this.entries.size, ...this.stats,
      hit_rate: (this.stats.hits + this.stats.misses)
        ? Math.round((this.stats.hits / (this.stats.hits + this.stats.misses)) * 1000) / 1000
        : 0,
    };
  }
}
