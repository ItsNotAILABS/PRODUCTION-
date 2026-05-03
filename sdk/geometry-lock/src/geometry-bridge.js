/**
 * @auro/geometry-lock — GeometryBridge
 *
 * Adapter that gates access to sdk/medina-calls/ behind the Geometric Key Protocol.
 * Wraps every medina-call category (civitas, organism, governance) with a
 * geometry-lock middleware layer.
 *
 * Architecture:
 *   External caller (Nova partner / Google AI)
 *       ↓ presents geometric key token
 *   GeometryBridge.call(token, callFn, ...args)
 *       ↓ GeometricKeyProtocol.validateKey(token) → R > φ⁻¹ ?
 *       ↓ YES → forward to medina-call
 *       ↓ NO  → DENIED + logged + sentinel contract alert
 *
 * The bridge registers itself as an EXCHANGE intelligence contract (PROTO-223):
 *   condition: caller presents a resonating geometric key
 *   action:    forward the call to the target medina-call function
 *
 * Usage:
 *   const bridge = new GeometryBridge({ sentinelAlert: myAlertFn });
 *   bridge.registerCaller('nova-partner', sharedSecret);
 *
 *   // On each inbound request from the partner:
 *   const result = await bridge.call(token, callDeployOrganism, config);
 */

import { GeometryLockSDK, ACCESS } from './geometry-lock-sdk.js';

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

// EXCHANGE contract state (simplified inline — mirrors PROTO-223 shape)
const CONTRACT_STATE = {
  WATCHING:  'watching',
  TRIGGERED: 'triggered',
  EXECUTING: 'executing',
  FULFILLED: 'fulfilled',
  DENIED:    'denied',
};

class GeometryBridge {
  /**
   * @param {object} config
   * @param {object}   [config.lockConfig]      - Options forwarded to GeometryLockSDK
   * @param {Function} [config.sentinelAlert]   - fn({ callerId, reason, R, at }) for denied access
   * @param {Function} [config.onGrant]         - fn({ callerId, R, callType, at }) for granted access
   * @param {boolean}  [config.dryRun=false]    - Log only, do not execute calls
   */
  constructor(config = {}) {
    this._lock         = new GeometryLockSDK(config.lockConfig || {});
    this._sentinelAlert = config.sentinelAlert || null;
    this._onGrant       = config.onGrant       || null;
    this.dryRun         = config.dryRun        || false;

    this._callLog  = [];   // recent call events (capped at 200)
    this._contracts = [];  // registered EXCHANGE contracts

    this.stats = {
      totalCalls:  0,
      granted:     0,
      denied:      0,
    };
  }

  // ── Caller management (delegated to lock) ─────────────────────────────────

  registerCaller(callerId, secret, opts = {}) {
    return this._lock.registerCaller(callerId, secret, opts);
  }

  revokeKey(callerId, reason) {
    return this._lock.revokeKey(callerId, reason);
  }

  getCallerState(callerId) {
    return this._lock.getCallerState(callerId);
  }

  // ── Exchange contract registration ────────────────────────────────────────

  /**
   * Register an EXCHANGE intelligence contract that binds a caller to a
   * specific medina-call function.  When the caller presents a resonating key,
   * the contract is fulfilled and the target function is invoked.
   *
   * @param {object} contractDef
   * @param {string}   contractDef.callerId  - Caller this contract is bound to
   * @param {string}   contractDef.id        - Unique contract id
   * @param {Function} contractDef.target    - medina-call fn to invoke on fulfillment
   * @param {string}   [contractDef.label]   - Human-readable description
   * @returns {object} - Registered contract descriptor
   */
  registerContract({ callerId, id, target, label = '' }) {
    if (typeof target !== 'function') {
      throw new Error('contract target must be a function');
    }
    const contract = {
      id:       id || `exchange-${callerId}-${Date.now().toString(36)}`,
      callerId,
      target,
      label,
      state:    CONTRACT_STATE.WATCHING,
      weight:   PHI_INV,
      fulfillCount: 0,
      denyCount:    0,
      createdAt:    Date.now(),
    };
    this._contracts.push(contract);
    return contract;
  }

  // ── Gated call execution ──────────────────────────────────────────────────

  /**
   * Execute a medina-call function only if the presented geometric key resonates.
   *
   * @param {object}   token  - Geometric key token from the partner
   * @param {Function} callFn - medina-call function to execute on grant
   * @param {...*}     args   - Arguments forwarded to callFn
   * @returns {Promise<object>} - { access, result?, denial? }
   */
  async call(token, callFn, ...args) {
    this.stats.totalCalls++;
    const now = Date.now();

    if (typeof callFn !== 'function') {
      throw new Error('callFn must be a callable medina-call function');
    }

    const validation = this._lock.validateKey(token);

    if (validation.access === ACCESS.DENIED) {
      this.stats.denied++;
      this._logCall({
        event:    'denied',
        callerId: token?.callerId,
        reason:   validation.reason,
        R:        validation.R,
        at:       now,
      });

      // Notify sentinel
      if (this._sentinelAlert) {
        this._sentinelAlert({
          callerId: token?.callerId,
          reason:   validation.reason,
          R:        validation.R,
          at:       now,
        });
      }

      // Update any matching contracts
      for (const c of this._contracts) {
        if (c.callerId === token?.callerId) {
          c.state = CONTRACT_STATE.DENIED;
          c.denyCount++;
          c.weight = Math.max(0.01, c.weight * PHI_INV);
        }
      }

      return {
        access:  ACCESS.DENIED,
        denial:  { callerId: token?.callerId, reason: validation.reason, R: validation.R },
      };
    }

    // Access granted — execute the call
    this.stats.granted++;

    // Update contracts
    for (const c of this._contracts) {
      if (c.callerId === token.callerId && c.target === callFn) {
        c.state = CONTRACT_STATE.EXECUTING;
      }
    }

    if (this._onGrant) {
      this._onGrant({
        callerId: token.callerId,
        R:        validation.R,
        callType: callFn.name || 'unknown',
        at:       now,
      });
    }

    let result;
    if (this.dryRun) {
      result = { dryRun: true, callType: callFn.name, args };
    } else {
      result = await callFn(...args);
    }

    // Fulfill contracts
    for (const c of this._contracts) {
      if (c.callerId === token.callerId && c.target === callFn) {
        c.state       = CONTRACT_STATE.FULFILLED;
        c.fulfillCount++;
        c.weight      = Math.min(PHI, c.weight + 0.05);
      }
    }

    const executedAt = Date.now();
    this._logCall({
      event:    'granted',
      callerId: token.callerId,
      R:        validation.R,
      callType: callFn.name || 'unknown',
      durationMs: executedAt - now,
      at:       executedAt,
    });

    return {
      access: ACCESS.GRANTED,
      callerId: token.callerId,
      R:        validation.R,
      result,
      _meta: {
        callType:   callFn.name || 'unknown',
        executedAt,
        durationMs: executedAt - now,
        phiTimestamp: executedAt * PHI_INV,
      },
    };
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  /**
   * Bridge health metrics combining lock and call statistics.
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this.stats,
      grantRate: this.stats.totalCalls > 0
        ? this.stats.granted / this.stats.totalCalls
        : 0,
      denyRate: this.stats.totalCalls > 0
        ? this.stats.denied / this.stats.totalCalls
        : 0,
      activeContracts: this._contracts.filter(c => c.state === CONTRACT_STATE.WATCHING).length,
      lock: this._lock.getMetrics(),
    };
  }

  /**
   * Return recent call log (up to 200 entries).
   * @returns {object[]}
   */
  getCallLog() {
    return [...this._callLog];
  }

  /**
   * Return registered contract states.
   * @returns {object[]}
   */
  getContracts() {
    return this._contracts.map(c => ({
      id:           c.id,
      callerId:     c.callerId,
      label:        c.label,
      state:        c.state,
      weight:       c.weight,
      fulfillCount: c.fulfillCount,
      denyCount:    c.denyCount,
    }));
  }

  _logCall(entry) {
    this._callLog.push(entry);
    if (this._callLog.length > 200) this._callLog.shift();
  }
}

export { GeometryBridge, CONTRACT_STATE };
export default GeometryBridge;
