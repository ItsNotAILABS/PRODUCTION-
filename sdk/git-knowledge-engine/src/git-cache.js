import crypto from 'node:crypto';

/**
 * GitCache — TTL-scoped result cache keyed by mission type + param hash.
 * Prevents redundant re-execution of expensive missions within a session.
 * Each entry expires independently; a background sweep removes stale entries
 * every full TTL cycle.
 */
export class GitCache {
  /** @type {Map<string, { value: *, expiresAt: number, hits: number }>} */
  #store = new Map();

  /** @type {number} */
  #ttlMs;

  /** @type {ReturnType<typeof setInterval> | null} */
  #sweepTimer = null;

  /** @type {{ hits: number, misses: number, evictions: number, sets: number }} */
  #stats = { hits: 0, misses: 0, evictions: 0, sets: 0 };

  /**
   * @param {number} ttlMs - Entry lifetime in milliseconds.
   */
  constructor(ttlMs = 300_000) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new RangeError(`GitCache: ttlMs must be a positive number, got ${ttlMs}`);
    }
    this.#ttlMs = ttlMs;
    this.#sweepTimer = setInterval(() => this.#sweep(), ttlMs);
    this.#sweepTimer.unref?.(); // don't block process exit
  }

  /**
   * Build a cache key from a mission type and optional params object.
   * @param {string} missionType
   * @param {object} [params]
   * @returns {string}
   */
  static key(missionType, params = {}) {
    const payload = JSON.stringify({ missionType, params });
    return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
  }

  /**
   * Retrieve a cached value. Returns undefined on miss or expiry.
   * @param {string} key
   * @returns {* | undefined}
   */
  get(key) {
    const entry = this.#store.get(key);
    if (!entry) { this.#stats.misses++; return undefined; }
    if (Date.now() > entry.expiresAt) {
      this.#store.delete(key);
      this.#stats.misses++;
      this.#stats.evictions++;
      return undefined;
    }
    entry.hits++;
    this.#stats.hits++;
    return entry.value;
  }

  /**
   * Store a value under a key.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlMs] - Override TTL for this entry only.
   */
  set(key, value, ttlMs) {
    this.#store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.#ttlMs),
      hits: 0,
    });
    this.#stats.sets++;
  }

  /**
   * Invalidate a specific key.
   * @param {string} key
   */
  invalidate(key) {
    this.#store.delete(key);
  }

  /**
   * Invalidate all entries whose keys start with a prefix.
   * @param {string} prefix
   */
  invalidatePrefix(prefix) {
    for (const key of this.#store.keys()) {
      if (key.startsWith(prefix)) this.#store.delete(key);
    }
  }

  /** Remove all entries. */
  clear() {
    this.#store.clear();
  }

  /**
   * Cache statistics.
   * @returns {{ size: number, hits: number, misses: number, evictions: number, sets: number, hitRate: number }}
   */
  stats() {
    const total = this.#stats.hits + this.#stats.misses;
    return {
      size:       this.#store.size,
      hits:       this.#stats.hits,
      misses:     this.#stats.misses,
      evictions:  this.#stats.evictions,
      sets:       this.#stats.sets,
      hitRate:    total > 0 ? parseFloat((this.#stats.hits / total).toFixed(4)) : 0,
    };
  }

  /** Stop the background sweep timer. Call when discarding the cache. */
  destroy() {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
    this.#store.clear();
  }

  #sweep() {
    const now = Date.now();
    for (const [key, entry] of this.#store) {
      if (now > entry.expiresAt) {
        this.#store.delete(key);
        this.#stats.evictions++;
      }
    }
  }
}

export default GitCache;
