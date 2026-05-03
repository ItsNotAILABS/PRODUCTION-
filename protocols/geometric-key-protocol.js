/**
 * PROTO-226: Geometric Key Protocol (GKP)
 * Phase-resonance access gate — geometric identity verification for external callers.
 *
 * A geometric key is a phi-spiral encoded phase vector derived from a shared secret
 * and the current heartbeat time window. Identity is proven not by matching a string
 * but by demonstrating phase resonance with the organism's expected envelope.
 *
 * Key lifecycle:
 *   REGISTERED → ACTIVE → RESONATING → GRANTED
 *                              ↓
 *                          DRIFTED → DENIED → (re-key or revoke)
 *
 * Resonance check (Kuramoto order parameter):
 *   R·e^(iΨ) = (1/N)·Σe^(iθⱼ)
 *   If R > EMERGENCE_THRESHOLD (φ⁻¹ = 0.618) → access granted
 *   If R ≤ threshold              → access denied + logged
 *
 * Time windows rotate every HEARTBEAT × φ milliseconds (~1411ms).
 * Keys are multi-dimensional (default 8 phases) — no single value to steal.
 * HMAC signature (SHA-256) prevents token tampering (reuses SCVP approach).
 *
 * @module protocols/geometric-key-protocol
 * @version 1.0.0
 */

import { createHmac, timingSafeEqual } from 'crypto';

const PHI                = 1.618033988749895;
const PHI_INV            = 1 / PHI;
const HEARTBEAT          = 873;
const WINDOW_MS          = Math.round(HEARTBEAT * PHI);   // ~1411 ms per time window
const EMERGENCE_THRESHOLD = PHI_INV;                      // 0.618…
const DEFAULT_DIMENSIONS = 8;                             // phase vector dimensionality
const TWO_PI             = 2 * Math.PI;

// ── Key states ────────────────────────────────────────────────────────────────
const KEY_STATES = {
  REGISTERED: 'registered',
  ACTIVE:     'active',
  RESONATING: 'resonating',
  GRANTED:    'granted',
  DRIFTED:    'drifted',
  DENIED:     'denied',
  REVOKED:    'revoked',
};

// ── Access decisions ──────────────────────────────────────────────────────────
const ACCESS = {
  GRANTED: 'granted',
  DENIED:  'denied',
};

// ── Phase vector utilities ────────────────────────────────────────────────────

/**
 * Derive a phi-spiral phase vector from an HMAC digest.
 * Each pair of bytes maps to one phase angle in [0, 2π).
 * Successive angles are offset by the golden ratio to create the phi-spiral.
 *
 * @param {string} secret     - Shared secret
 * @param {string} callerId   - Caller identity
 * @param {number} timeWindow - Integer window index
 * @param {number} dimensions - Vector dimensionality
 * @returns {number[]} - Phase angles [θ₁, θ₂, ..., θₙ]
 */
function derivePhaseVector(secret, callerId, timeWindow, dimensions = DEFAULT_DIMENSIONS) {
  const material = `${callerId}|${timeWindow}`;
  const digest   = createHmac('sha256', secret).update(material).digest();
  const phases   = [];

  for (let i = 0; i < dimensions; i++) {
    const byteA = digest[(i * 2)     % digest.length];
    const byteB = digest[(i * 2 + 1) % digest.length];
    const raw   = ((byteA << 8) | byteB) / 65535;  // normalise to [0, 1)
    // Apply phi-spiral offset so each dimension sits on the golden spiral
    const phiOffset = (i * (PHI - 1) * TWO_PI) % TWO_PI;
    phases.push((raw * TWO_PI + phiOffset) % TWO_PI);
  }

  return phases;
}

/**
 * Compute the phase-difference resonance score between two phase vectors.
 *
 * Uses the Kuramoto order parameter on the per-dimension phase differences:
 *   diff_i = presented_i − expected_i
 *   R·e^(iΨ) = (1/N)·Σ e^(i·diff_j)
 *
 * Interpretation:
 *   R = 1.0 → perfect match (all diffs = 0)
 *   R ≈ 0   → phases are uncorrelated (wrong key)
 *   R > EMERGENCE_THRESHOLD (φ⁻¹ ≈ 0.618) → resonant → access granted
 *
 * This is superior to combining the two vectors, because the phi-spiral
 * distributes phases uniformly across [0, 2π) — a naïve combination would
 * always produce R ≈ 0 even for a correct key.
 *
 * @param {number[]} presentedPhases
 * @param {number[]} expectedPhases
 * @returns {{ R: number, Psi: number }}
 */
function orderParameter(presentedPhases, expectedPhases) {
  const N = presentedPhases.length;
  if (N === 0 || N !== expectedPhases.length) return { R: 0, Psi: 0 };

  let sumCos = 0;
  let sumSin = 0;
  for (let i = 0; i < N; i++) {
    const diff = presentedPhases[i] - expectedPhases[i];
    sumCos += Math.cos(diff);
    sumSin += Math.sin(diff);
  }
  sumCos /= N;
  sumSin /= N;

  return {
    R:   Math.sqrt(sumCos * sumCos + sumSin * sumSin),
    Psi: Math.atan2(sumSin, sumCos),
  };
}

/**
 * Return the integer index of the current heartbeat time window.
 * Changes every WINDOW_MS milliseconds.
 */
function currentWindow() {
  return Math.floor(Date.now() / WINDOW_MS);
}

// ── CallerRecord ──────────────────────────────────────────────────────────────

class CallerRecord {
  constructor({ callerId, secret, dimensions = DEFAULT_DIMENSIONS, label = '' }) {
    this.callerId     = callerId;
    this.secret       = secret;
    this.dimensions   = dimensions;
    this.label        = label;
    this.state        = KEY_STATES.REGISTERED;
    this.registeredAt = Date.now();
    this.lastAccess   = null;
    this.grantCount   = 0;
    this.denyCount    = 0;
    this.revoked      = false;
  }

  /** Generate the expected phase vector for a given time window. */
  expectedPhases(window) {
    return derivePhaseVector(this.secret, this.callerId, window, this.dimensions);
  }
}

// ── GeometricKeyProtocol ──────────────────────────────────────────────────────

class GeometricKeyProtocol {
  /**
   * @param {object} config
   * @param {number} [config.dimensions]       - Phase vector dimensions (default 8)
   * @param {number} [config.windowTolerance]  - Accept keys ± N windows (default 1)
   * @param {number} [config.threshold]        - Resonance threshold (default φ⁻¹ = 0.618)
   */
  constructor(config = {}) {
    this.callers         = new Map();   // callerId → CallerRecord
    this.accessLog       = [];          // capped at 500 entries
    this.dimensions      = config.dimensions      || DEFAULT_DIMENSIONS;
    this.windowTolerance = config.windowTolerance !== undefined ? config.windowTolerance : 1;
    this.threshold       = config.threshold       !== undefined ? config.threshold : EMERGENCE_THRESHOLD;

    this.stats = {
      totalValidations: 0,
      totalGranted:     0,
      totalDenied:      0,
      totalRevocations: 0,
    };
  }

  // ── Caller registration ───────────────────────────────────────────────────

  /**
   * Register an external caller with a shared secret.
   * The secret must be established out-of-band between parties.
   *
   * @param {string} callerId - Unique identifier (e.g. 'nova-partner')
   * @param {string} secret   - Shared secret (≥ 16 chars recommended)
   * @param {object} [opts]   - { dimensions, label }
   * @returns {object}        - { callerId, registeredAt, windowMs, dimensions, threshold }
   */
  registerCaller(callerId, secret, opts = {}) {
    if (!callerId || typeof callerId !== 'string') {
      throw new Error('callerId must be a non-empty string');
    }
    if (!secret || typeof secret !== 'string' || secret.length < 8) {
      throw new Error('secret must be a string of at least 8 characters');
    }

    const record = new CallerRecord({
      callerId,
      secret,
      dimensions: opts.dimensions || this.dimensions,
      label:      opts.label      || callerId,
    });

    this.callers.set(callerId, record);
    this._log({ event: 'registered', callerId, at: Date.now() });

    return {
      callerId,
      registeredAt: record.registeredAt,
      windowMs:     WINDOW_MS,
      dimensions:   record.dimensions,
      threshold:    this.threshold,
    };
  }

  /**
   * Revoke a caller's access permanently.
   * @param {string} callerId
   * @param {string} [reason]
   * @returns {object}
   */
  revokeCaller(callerId, reason = 'revoked') {
    const record = this.callers.get(callerId);
    if (!record) return { revoked: false, reason: 'caller not found' };

    record.revoked = true;
    record.state   = KEY_STATES.REVOKED;
    this.stats.totalRevocations++;
    this._log({ event: 'revoked', callerId, reason, at: Date.now() });

    return { revoked: true, callerId, reason };
  }

  // ── Key generation ────────────────────────────────────────────────────────

  /**
   * Generate a geometric key token for a caller.
   * Typically called by the external partner to produce a key for each call.
   * The token is valid for the current time window (± windowTolerance windows).
   *
   * @param {string} callerId - Must match a registered caller
   * @param {string} secret   - Must match the registered secret
   * @returns {object}        - { callerId, phases, window, signature, generatedAt, windowMs }
   */
  generateKey(callerId, secret) {
    const win    = currentWindow();
    const phases = derivePhaseVector(secret, callerId, win, this.dimensions);
    const payload    = JSON.stringify({ callerId, phases, window: win });
    const signature  = createHmac('sha256', secret).update(payload).digest('hex');

    return {
      callerId,
      phases,
      window:      win,
      signature,
      generatedAt: Date.now(),
      windowMs:    WINDOW_MS,
    };
  }

  // ── Key validation ────────────────────────────────────────────────────────

  /**
   * Validate a geometric key token.
   *
   * Steps:
   *   1. Caller must be registered and not revoked
   *   2. Verify HMAC signature (tamper-proof check)
   *   3. Time window must be within tolerance
   *   4. Compute Kuramoto order parameter R between presented and expected phases
   *   5. Grant if R > threshold, deny otherwise
   *
   * @param {object} token - { callerId, phases, window, signature }
   * @returns {object}     - { access, callerId, R, Psi, window, reason }
   */
  validateKey(token) {
    this.stats.totalValidations++;
    const now    = Date.now();
    const result = this._validate(token);

    const record = this.callers.get(token?.callerId);
    if (record) {
      record.lastAccess = now;
      if (result.access === ACCESS.GRANTED) {
        record.grantCount++;
        record.state = KEY_STATES.GRANTED;
      } else {
        record.denyCount++;
        record.state = KEY_STATES.DENIED;
      }
    }

    if (result.access === ACCESS.GRANTED) {
      this.stats.totalGranted++;
    } else {
      this.stats.totalDenied++;
    }

    this._log({ event: result.access, callerId: token?.callerId, R: result.R, at: now });
    return result;
  }

  _validate(token) {
    if (!token || typeof token !== 'object') {
      return this._deny('invalid token structure');
    }

    const { callerId, phases, window: tokenWindow, signature } = token;

    // 1. Caller must be registered
    const record = this.callers.get(callerId);
    if (!record) {
      return this._deny('caller not registered', callerId);
    }

    // 2. Caller must not be revoked
    if (record.revoked) {
      return this._deny('caller revoked', callerId);
    }

    // 3. Phases must be a valid array with the correct dimensionality
    if (!Array.isArray(phases) || phases.length !== record.dimensions) {
      return this._deny('invalid phase vector dimensions', callerId);
    }

    // 4. Verify HMAC signature (timing-safe comparison)
    const payload  = JSON.stringify({ callerId, phases, window: tokenWindow });
    const expected = createHmac('sha256', record.secret).update(payload).digest('hex');
    const sigBuf   = Buffer.from(signature  || '', 'hex');
    const expBuf   = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return this._deny('signature mismatch', callerId);
    }

    // 5. Time window must be within tolerance
    const win = currentWindow();
    if (Math.abs(tokenWindow - win) > this.windowTolerance) {
      return this._deny(
        'key expired — time window out of tolerance',
        callerId,
        { tokenWindow, currentWindow: win },
      );
    }

    // 6. Compute resonance between presented and expected phase vectors
    const expectedPhases = record.expectedPhases(tokenWindow);
    const { R, Psi }     = orderParameter(phases, expectedPhases);

    if (R > this.threshold) {
      return {
        access:    ACCESS.GRANTED,
        callerId,
        R,
        Psi,
        window:    tokenWindow,
        threshold: this.threshold,
      };
    }

    return this._deny(
      `resonance below threshold (R=${R.toFixed(4)} ≤ ${this.threshold.toFixed(4)})`,
      callerId,
      { R, Psi },
    );
  }

  _deny(reason, callerId = null, extra = {}) {
    return {
      access:   ACCESS.DENIED,
      callerId,
      reason,
      R:   extra.R   || 0,
      Psi: extra.Psi || 0,
      ...extra,
    };
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  /**
   * Get the current state of a registered caller.
   * @param {string} callerId
   * @returns {object|null}
   */
  getCallerState(callerId) {
    const record = this.callers.get(callerId);
    if (!record) return null;
    return {
      callerId:     record.callerId,
      label:        record.label,
      state:        record.state,
      revoked:      record.revoked,
      dimensions:   record.dimensions,
      grantCount:   record.grantCount,
      denyCount:    record.denyCount,
      lastAccess:   record.lastAccess,
      registeredAt: record.registeredAt,
    };
  }

  /**
   * Return protocol health metrics.
   * @returns {object}
   */
  getMetrics() {
    return {
      registeredCallers: this.callers.size,
      activeCallers:     [...this.callers.values()].filter(c => !c.revoked).length,
      windowMs:          WINDOW_MS,
      threshold:         this.threshold,
      dimensions:        this.dimensions,
      ...this.stats,
    };
  }

  _log(entry) {
    this.accessLog.push(entry);
    if (this.accessLog.length > 500) this.accessLog.shift();
  }
}

export {
  GeometricKeyProtocol,
  KEY_STATES,
  ACCESS,
  WINDOW_MS,
  EMERGENCE_THRESHOLD,
  DEFAULT_DIMENSIONS,
  derivePhaseVector,
  orderParameter,
  currentWindow,
};
export default GeometricKeyProtocol;
