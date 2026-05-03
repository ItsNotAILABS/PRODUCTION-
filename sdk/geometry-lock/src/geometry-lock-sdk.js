/**
 * @auro/geometry-lock — GeometryLockSDK
 *
 * Callable surface for the Geometric Key Protocol (PROTO-226).
 * Wraps key generation, validation, caller registration, and revocation
 * behind a clean object-oriented API for use by organism infrastructure
 * and external Nova protocol partners.
 *
 * Usage (organism / lock side):
 *   const lock = new GeometryLockSDK({ mode: 'lock' });
 *   lock.registerCaller('nova-partner', sharedSecret);
 *   const result = lock.validateKey(incomingToken);
 *   if (result.access === 'granted') { ... }
 *
 * Usage (partner / key side):
 *   const sdk = new GeometryLockSDK({ mode: 'key', callerId: 'nova-partner', secret });
 *   const token = sdk.generateKey();
 *   // send token with each call
 */

import {
  GeometricKeyProtocol,
  KEY_STATES,
  ACCESS,
  WINDOW_MS,
  EMERGENCE_THRESHOLD,
  DEFAULT_DIMENSIONS,
} from '../../../protocols/geometric-key-protocol.js';

class GeometryLockSDK {
  /**
   * @param {object} config
   * @param {'lock'|'key'|'both'} [config.mode='both']  - Operational mode
   * @param {string}  [config.callerId]     - Required in 'key' mode
   * @param {string}  [config.secret]       - Required in 'key' mode
   * @param {number}  [config.dimensions]   - Phase vector dimensions (default 8)
   * @param {number}  [config.windowTolerance] - Accepted window skew (default 1)
   * @param {number}  [config.threshold]    - Resonance threshold (default φ⁻¹)
   */
  constructor(config = {}) {
    this.mode       = config.mode || 'both';
    this.callerId   = config.callerId || null;
    this.secret     = config.secret   || null;

    this._protocol  = new GeometricKeyProtocol({
      dimensions:      config.dimensions,
      windowTolerance: config.windowTolerance,
      threshold:       config.threshold,
    });

    // If secret + callerId are provided, auto-register as a caller
    if (this.callerId && this.secret) {
      this._protocol.registerCaller(this.callerId, this.secret, {
        label: config.label || this.callerId,
      });
    }
  }

  // ── Key-side API ────────────────────────────────────────────────────────────

  /**
   * Generate a geometric key token for the current time window.
   * Call this before each outbound request that requires geometry-locked access.
   *
   * @param {string} [callerId] - Defaults to this.callerId
   * @param {string} [secret]   - Defaults to this.secret
   * @returns {object} - { callerId, phases, window, signature, generatedAt, windowMs }
   */
  generateKey(callerId, secret) {
    const id  = callerId || this.callerId;
    const sec = secret   || this.secret;
    if (!id || !sec) {
      throw new Error('generateKey requires callerId and secret (pass or set in constructor)');
    }
    return this._protocol.generateKey(id, sec);
  }

  // ── Lock-side API ───────────────────────────────────────────────────────────

  /**
   * Register an external caller with their shared secret.
   * Call this during partner onboarding.
   *
   * @param {string} callerId - Partner identifier (e.g. 'nova-partner')
   * @param {string} secret   - Shared secret established out-of-band
   * @param {object} [opts]   - { dimensions, label }
   * @returns {object}        - Registration receipt
   */
  registerCaller(callerId, secret, opts = {}) {
    return this._protocol.registerCaller(callerId, secret, opts);
  }

  /**
   * Validate an incoming geometric key token.
   * Returns { access: 'granted'|'denied', callerId, R, Psi, reason? }
   *
   * @param {object} token - Token produced by the partner's generateKey()
   * @returns {object}
   */
  validateKey(token) {
    return this._protocol.validateKey(token);
  }

  /**
   * Revoke a caller's access.
   * @param {string} callerId
   * @param {string} [reason]
   * @returns {object}
   */
  revokeKey(callerId, reason) {
    return this._protocol.revokeCaller(callerId, reason);
  }

  // ── Introspection ───────────────────────────────────────────────────────────

  /**
   * Get state for a specific registered caller.
   * @param {string} callerId
   * @returns {object|null}
   */
  getCallerState(callerId) {
    return this._protocol.getCallerState(callerId);
  }

  /**
   * Get lock health metrics (registered callers, grant/deny rates, window info).
   * @returns {object}
   */
  getMetrics() {
    return this._protocol.getMetrics();
  }

  /**
   * Return the recent access log (up to 500 entries).
   * @returns {object[]}
   */
  getAccessLog() {
    return [...this._protocol.accessLog];
  }
}

export { GeometryLockSDK, KEY_STATES, ACCESS, WINDOW_MS, EMERGENCE_THRESHOLD, DEFAULT_DIMENSIONS };
export default GeometryLockSDK;
