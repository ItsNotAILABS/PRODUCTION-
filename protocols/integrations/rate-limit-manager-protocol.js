/**
 * PROTO-I004: Rate Limit Manager Protocol (RLMP)
 * Derives from: GateKeeperProtocol, SovereignRoutingProtocol
 * Global rate limiting across integrations using sliding window and phi-weighted burst tolerance.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class RateLimitManagerProtocol {
  #limits  = new Map(); // platform → { requestsPerMin, burstMax, window: number[] }

  constructor(config = {}) {
    this.version   = '1.0.0';
    this.domain    = 'integrations';
    this.windowMs  = config.windowMs ?? 60_000;
    this.metrics   = { platforms: 0, consumed: 0, allowed: 0, throttled: 0, violations: 0 };
  }

  /** Register rate limit config for a platform. */
  registerLimit(platform, { requestsPerMin = 60, burstMax = null } = {}) {
    const burst = burstMax ?? Math.ceil(requestsPerMin * PHI_INV);
    this.#limits.set(platform, { requestsPerMin, burstMax: burst, window: [] });
    this.metrics.platforms++;
    return { platform, requestsPerMin, burstMax: burst };
  }

  /** Consume quota for a platform. Returns {allowed, remaining, resetMs, throttled}. */
  consume(platform, cost = 1) {
    const limit = this.#limits.get(platform);
    if (!limit) throw new Error(`No rate limit registered for platform: ${platform}`);

    const now   = Date.now();
    const cutoff = now - this.windowMs;

    // Slide window — evict expired timestamps
    limit.window = limit.window.filter((ts) => ts > cutoff);

    const usedInWindow = limit.window.length;
    const phiBurst     = Math.ceil(limit.burstMax * PHI_INV); // short-burst allowance
    const effective    = usedInWindow < phiBurst ? limit.burstMax : limit.requestsPerMin;
    const allowed      = usedInWindow + cost <= effective;

    this.metrics.consumed++;
    if (allowed) {
      for (let i = 0; i < cost; i++) limit.window.push(now);
      this.metrics.allowed++;
    } else {
      this.metrics.throttled++;
      if (usedInWindow > effective * PHI) this.metrics.violations++;
    }

    const oldest   = limit.window[0] ?? now;
    const resetMs  = Math.max(0, oldest + this.windowMs - now);
    const remaining = Math.max(0, effective - limit.window.length);
    return { allowed, remaining, resetMs, throttled: !allowed };
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default RateLimitManagerProtocol;
