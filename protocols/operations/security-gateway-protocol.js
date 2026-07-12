/**
 * PROTO-O005: Security Gateway Protocol (SGP)
 * Derives from: CyberDefenseProtocol, SovereignIdentityProtocol
 * Request authentication, rate limiting, threat scoring, and access control enforcement.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const THREAT_LEVEL = Object.freeze({
  NONE:     'none',
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
});

export const ACCESS_RESULT = Object.freeze({
  ALLOWED:  'allowed',
  DENIED:   'denied',
  THROTTLED: 'throttled',
  BLOCKED:  'blocked',
});

export class SecurityGatewayProtocol {
  constructor(config = {}) {
    this.version         = '1.0.0';
    this.domain          = 'operations';
    this.rateLimitWindow = config.rateLimitWindow ?? 60_000;  // ms
    this.rateLimitMax    = config.rateLimitMax    ?? 100;     // requests per window
    this.blockThreshold  = config.blockThreshold  ?? 0.75;   // threat score to auto-block
    this.metrics         = { requests: 0, allowed: 0, denied: 0, throttled: 0, blocked: 0, threats: 0 };
    this.#rateCounters   = new Map();  // identity → { count, windowStart }
    this.#blocklist      = new Set();
    this.#allowlist      = new Set();
    this.#threatLog      = [];
  }

  #rateCounters;
  #blocklist;
  #allowlist;
  #threatLog;

  /**
   * Add an identity to the allowlist (bypasses rate limiting).
   */
  allow(identity) { this.#allowlist.add(identity); }

  /**
   * Add an identity to the blocklist.
   */
  block(identity) { this.#blocklist.add(identity); }

  unblock(identity) { this.#blocklist.delete(identity); }

  /**
   * Evaluate an incoming request.
   * @param {{ identity: string, ip?: string, method?: string, path?: string, headers?: object, body?: object }} request
   * @returns {{ result: string, threatLevel: string, threatScore: number, reason: string }}
   */
  evaluate(request) {
    const { identity, ip, method = 'GET', path = '/', headers = {}, body = {} } = request;
    this.metrics.requests++;

    // Blocklist
    if (this.#blocklist.has(identity) || (ip && this.#blocklist.has(ip))) {
      this.metrics.blocked++;
      return { result: ACCESS_RESULT.BLOCKED, threatLevel: THREAT_LEVEL.CRITICAL, threatScore: 1, reason: 'identity is blocklisted' };
    }

    // Threat scoring
    const threatScore = this.#scoreThreat({ identity, ip, method, path, headers, body });
    const threatLevel = threatScore >= 0.75 ? THREAT_LEVEL.CRITICAL
      : threatScore >= 0.5  ? THREAT_LEVEL.HIGH
      : threatScore >= 0.25 ? THREAT_LEVEL.MEDIUM
      : threatScore >= 0.1  ? THREAT_LEVEL.LOW
      : THREAT_LEVEL.NONE;

    if (threatScore >= this.blockThreshold) {
      this.#blocklist.add(identity);
      this.metrics.blocked++;
      this.metrics.threats++;
      this.#logThreat(identity, threatScore, 'auto-blocked');
      return { result: ACCESS_RESULT.BLOCKED, threatLevel, threatScore: Math.round(threatScore * 1000) / 1000, reason: 'threat score exceeded auto-block threshold' };
    }

    if (threatLevel !== THREAT_LEVEL.NONE) {
      this.metrics.threats++;
      this.#logThreat(identity, threatScore, `threat level: ${threatLevel}`);
    }

    // Allowlist bypasses rate limiting
    if (this.#allowlist.has(identity)) {
      this.metrics.allowed++;
      return { result: ACCESS_RESULT.ALLOWED, threatLevel, threatScore: Math.round(threatScore * 1000) / 1000, reason: 'allowlisted' };
    }

    // Rate limiting
    const throttled = this.#checkRateLimit(identity);
    if (throttled) {
      this.metrics.throttled++;
      return { result: ACCESS_RESULT.THROTTLED, threatLevel, threatScore: Math.round(threatScore * 1000) / 1000, reason: `rate limit exceeded: ${this.rateLimitMax} req/${this.rateLimitWindow}ms` };
    }

    this.metrics.allowed++;
    return { result: ACCESS_RESULT.ALLOWED, threatLevel, threatScore: Math.round(threatScore * 1000) / 1000, reason: 'request cleared' };
  }

  /**
   * Get threat log entries for an identity.
   * @param {string} [identity]
   * @returns {object[]}
   */
  threatLog(identity) {
    return identity ? this.#threatLog.filter((e) => e.identity === identity) : [...this.#threatLog];
  }

  /**
   * Compute rate limit state for an identity without consuming a slot.
   */
  rateLimitState(identity) {
    const state = this.#rateCounters.get(identity);
    if (!state) return { count: 0, remaining: this.rateLimitMax };
    const now = Date.now();
    if (now - state.windowStart > this.rateLimitWindow) return { count: 0, remaining: this.rateLimitMax };
    return { count: state.count, remaining: Math.max(0, this.rateLimitMax - state.count) };
  }

  #scoreThreat({ method, path, headers, body }) {
    let score = 0;

    // Suspicious HTTP methods
    if (['TRACE', 'CONNECT'].includes(method?.toUpperCase())) score += 0.3 * PHI_INV;

    // Path injection signals
    const suspiciousPaths = [/\.\.\//g, /\/etc\/passwd/i, /\/proc\//i, /<script/i, /union.*select/i];
    for (const pat of suspiciousPaths) { if (pat.test(path)) { score += 0.25 * PHI; break; } }

    // Missing or forged UA
    if (!headers['user-agent']) score += 0.1;

    // Body size anomaly — very large body
    const bodyLen = JSON.stringify(body).length;
    if (bodyLen > 1_000_000) score += 0.2 * PHI_INV;

    return Math.min(1, score);
  }

  #checkRateLimit(identity) {
    const now   = Date.now();
    const state = this.#rateCounters.get(identity) ?? { count: 0, windowStart: now };
    if (now - state.windowStart > this.rateLimitWindow) {
      state.count = 1; state.windowStart = now;
      this.#rateCounters.set(identity, state);
      return false;
    }
    state.count++;
    this.#rateCounters.set(identity, state);
    return state.count > this.rateLimitMax;
  }

  #logThreat(identity, score, detail) {
    this.#threatLog.push({ identity, score, detail, ts: new Date().toISOString() });
    if (this.#threatLog.length > 2000) this.#threatLog.shift();
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default SecurityGatewayProtocol;
