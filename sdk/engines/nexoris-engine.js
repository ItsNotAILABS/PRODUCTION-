/**
 * NEXORIS ENGINE — State Management Physics
 * 
 * The foundational "physics" of state in the Civitas system.
 * All agents use NEXORIS for state management, persistence, and synchronization.
 * 
 * Features:
 *   - 4-register cognitive architecture (Cognitive/Affective/Somatic/Sovereign)
 *   - Phi-weighted state transitions
 *   - State versioning and history
 *   - Cross-agent state synchronization
 *   - Persistent state with upgrade survival
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;

// State register types
const REGISTERS = ['cognitive', 'affective', 'somatic', 'sovereign'];

// Each register has 4 dimensions
const DIMENSIONS = ['awareness', 'coherence', 'resonance', 'entropy'];

class NexorisEngine {
  constructor() {
    // Initialize 4-register state architecture
    this.state = {
      cognitive: { awareness: 1.0, coherence: 1.0, resonance: PHI_INV, entropy: 0.0 },
      affective: { awareness: PHI_INV, coherence: 1.0, resonance: 1.0, entropy: 0.0 },
      somatic:   { awareness: 1.0, coherence: PHI_INV, resonance: 1.0, entropy: 0.0 },
      sovereign: { awareness: PHI, coherence: PHI, resonance: PHI, entropy: 0.0 },
    };
    
    // State history for time-travel debugging
    this.history = [];
    this.historyLimit = 100;
    this.version = 0;
    
    // Subscribers for reactive updates
    this.subscribers = new Map();
    
    // Cross-agent state sync
    this.syncPeers = new Map();
    
    // Custom state stores
    this.stores = new Map();
  }

  // ── Register State Operations ──────────────────────────────────────────

  /**
   * Get current value of a register dimension
   */
  get(register, dimension) {
    if (!REGISTERS.includes(register)) {
      throw new Error(`Invalid register: ${register}`);
    }
    if (!DIMENSIONS.includes(dimension)) {
      throw new Error(`Invalid dimension: ${dimension}`);
    }
    return this.state[register][dimension];
  }

  /**
   * Set a register dimension with phi-weighted transition
   */
  set(register, dimension, value, immediate = false) {
    if (!REGISTERS.includes(register)) {
      throw new Error(`Invalid register: ${register}`);
    }
    if (!DIMENSIONS.includes(dimension)) {
      throw new Error(`Invalid dimension: ${dimension}`);
    }
    
    const current = this.state[register][dimension];
    
    // Phi-weighted smooth transition (unless immediate)
    const newValue = immediate
      ? value
      : current * PHI_INV + value * (1 - PHI_INV);
    
    // Clamp to valid range
    const clamped = this.clamp(newValue, 0, dimension === 'entropy' ? PHI : PHI * PHI);
    
    // Record history
    this.recordHistory(register, dimension, current, clamped);
    
    // Update state
    this.state[register][dimension] = clamped;
    this.version++;
    
    // Notify subscribers
    this.notifySubscribers(register, dimension, clamped);
    
    return clamped;
  }

  /**
   * Update entire register at once
   */
  updateRegister(register, values, immediate = false) {
    for (const [dimension, value] of Object.entries(values)) {
      if (DIMENSIONS.includes(dimension)) {
        this.set(register, dimension, value, immediate);
      }
    }
    return this.getRegister(register);
  }

  /**
   * Older name for updateRegister. Kept because it is the published surface;
   * it never forwarded `immediate`, so a caller asking for an exact value got a
   * phi-weighted approach to it instead and had no way to say otherwise.
   */
  setRegister(register, values, immediate = false) {
    return this.updateRegister(register, values, immediate);
  }

  /**
   * Get entire register state
   */
  getRegister(register) {
    return { ...this.state[register] };
  }

  /**
   * Get full 4-register state snapshot
   */
  getSnapshot() {
    return {
      cognitive: { ...this.state.cognitive },
      affective: { ...this.state.affective },
      somatic: { ...this.state.somatic },
      sovereign: { ...this.state.sovereign },
      version: this.version,
      timestamp: Date.now(),
    };
  }

  // ── Custom State Stores ────────────────────────────────────────────────

  /**
   * Create a named state store
   */
  createStore(name, initialValue = {}) {
    const store = {
      value: { ...initialValue },
      version: 0,
      subscribers: [],
    };
    this.stores.set(name, store);
    return store;
  }

  /**
   * Get a store by name, or undefined if it does not exist.
   *
   * Returns the store itself — value *and* version — not a bare copy of the
   * value. Without the version a caller cannot tell a store that was updated to
   * the same value from one that was never touched, which is the whole point of
   * versioning it.
   */
  getStore(name) {
    return this.stores.get(name);
  }

  /**
   * Merge a patch into a store's value and bump its version.
   */
  updateStore(name, patch = {}) {
    const store = this.stores.get(name);
    if (!store) return this.createStore(name, patch);
    store.value = { ...store.value, ...patch };
    store.version++;
    for (const { callback } of [...store.subscribers]) {
      try {
        callback(store.value, store.version);
      } catch (e) {
        console.error(`[NEXORIS] Store subscriber error:`, e.message);
      }
    }
    return store;
  }

  /**
   * Set value in a store
   */
  setStore(name, key, value) {
    // Single-key sugar over updateStore, so both paths bump the version and
    // notify through exactly one code path.
    return this.updateStore(name, { [key]: value });
  }

  /**
   * Subscribe to store changes
   */
  subscribeStore(name, callback) {
    const store = this.stores.get(name);
    if (!store) return null;

    const subId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    store.subscribers.push({ id: subId, callback });
    const unsubscribe = () => this.unsubscribeStore(name, subId);
    unsubscribe.subId = subId;
    return unsubscribe;
  }

  /**
   * Unsubscribe from store
   */
  unsubscribeStore(name, subId) {
    const store = this.stores.get(name);
    if (!store) return false;
    const before = store.subscribers.length;
    store.subscribers = store.subscribers.filter((s) => s.id !== subId);
    return store.subscribers.length < before;
  }

  // ── Reactive Subscriptions ─────────────────────────────────────────────

  /**
   * Subscribe to register dimension changes
   */
  subscribe(register, dimension, callback) {
    const key = `${register}:${dimension}`;
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, []);
    }

    const subId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.subscribers.get(key).push({ id: subId, callback });

    // Return a closure rather than an id. Handing back an id forces every
    // caller to remember the register and dimension as well in order to undo
    // itself, and the three of them drift apart the moment the subscription is
    // set up somewhere other than where it is torn down.
    const unsubscribe = () => this.unsubscribe(register, dimension, subId);
    unsubscribe.subId = subId;
    return unsubscribe;
  }

  /**
   * Unsubscribe from changes
   */
  unsubscribe(register, dimension, subId) {
    const key = `${register}:${dimension}`;
    const subs = this.subscribers.get(key);
    if (!subs) return false;
    const before = subs.length;
    this.subscribers.set(key, subs.filter((s) => s.id !== subId));
    return this.subscribers.get(key).length < before;
  }

  /**
   * Notify subscribers of state change
   */
  notifySubscribers(register, dimension, value) {
    const key = `${register}:${dimension}`;
    const subs = this.subscribers.get(key);
    if (!subs) return;
    // Iterate a copy: a callback that unsubscribes itself would otherwise
    // mutate the array mid-loop and silently skip the next subscriber.
    for (const { callback } of [...subs]) {
      try {
        callback(value, register, dimension);
      } catch (e) {
        console.error(`[NEXORIS] Subscriber error:`, e.message);
      }
    }
  }

  // ── State History ──────────────────────────────────────────────────────

  /**
   * Record state change in history
   */
  recordHistory(register, dimension, oldValue, newValue) {
    this.history.push({
      register,
      dimension,
      oldValue,
      newValue,
      version: this.version,
      timestamp: Date.now(),
    });
    
    // Trim history if over limit
    if (this.history.length > this.historyLimit) {
      this.history = this.history.slice(-this.historyLimit);
    }
  }

  /**
   * Get state history
   */
  getHistory(limit = 20) {
    return this.history.slice(-limit);
  }

  /**
   * Revert to a previous version (time-travel)
   */
  revertTo(targetVersion) {
    const changes = this.history.filter(h => h.version > targetVersion);
    
    // Apply changes in reverse
    for (let i = changes.length - 1; i >= 0; i--) {
      const change = changes[i];
      this.state[change.register][change.dimension] = change.oldValue;
    }
    
    this.version = targetVersion;
  }

  // ── Cross-Agent Synchronization ────────────────────────────────────────

  /**
   * Register a peer for state sync
   */
  registerPeer(peerId, peerNexoris) {
    this.syncPeers.set(peerId, peerNexoris);
  }

  /**
   * Unregister a peer
   */
  unregisterPeer(peerId) {
    this.syncPeers.delete(peerId);
  }

  /**
   * Sync state with all peers
   * Uses phi-weighted averaging for conflict resolution
   */
  syncWithPeers() {
    const peerCount = this.syncPeers.size;
    if (peerCount === 0) return;
    
    const totalWeight = 1 + peerCount * PHI_INV;
    
    for (const register of REGISTERS) {
      for (const dimension of DIMENSIONS) {
        let sum = this.state[register][dimension];
        
        for (const peer of this.syncPeers.values()) {
          sum += peer.get(register, dimension) * PHI_INV;
        }
        
        this.state[register][dimension] = sum / totalWeight;
      }
    }
    
    this.version++;
  }

  // ── Phi-Weighted Computations ──────────────────────────────────────────

  /**
   * Calculate collective resonance score
   */
  getResonanceScore() {
    const c = this.state.cognitive.resonance * PHI;
    const a = this.state.affective.resonance;
    const s = this.state.somatic.resonance * PHI_INV;
    const v = this.state.sovereign.resonance * PHI;
    
    return (c + a + s + v) / (PHI + 1 + PHI_INV + PHI);
  }

  /**
   * Calculate system entropy
   */
  getTotalEntropy() {
    return (
      this.state.cognitive.entropy +
      this.state.affective.entropy +
      this.state.somatic.entropy +
      this.state.sovereign.entropy
    ) / 4;
  }

  /**
   * Calculate overall coherence
   */
  getCoherence() {
    const weights = [PHI, 1.0, PHI_INV, PHI];
    const values = [
      this.state.cognitive.coherence,
      this.state.affective.coherence,
      this.state.somatic.coherence,
      this.state.sovereign.coherence,
    ];
    
    let sum = 0;
    let weightSum = 0;
    for (let i = 0; i < 4; i++) {
      sum += values[i] * weights[i];
      weightSum += weights[i];
    }
    
    return sum / weightSum;
  }

  // ── Utility Functions ──────────────────────────────────────────────────

  /**
   * Clamp value to range
   */
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Get engine status
   */
  getHealth() {
    // One number per register, plus an overall. The three positive dimensions
    // (awareness, coherence, resonance) average together; entropy is the only
    // dimension where more is worse, so it discounts rather than averages in —
    // folding it into the mean would let a register look healthy purely because
    // it is disordered in a high-signal way.
    const health = {};
    for (const register of REGISTERS) {
      const r = this.state[register];
      const signal = (r.awareness + r.coherence + r.resonance) / 3;
      const disorder = this.clamp(r.entropy / PHI, 0, 1);
      health[register] = this.clamp(signal * (1 - disorder), 0, PHI);
    }
    health.overall = this.clamp(
      REGISTERS.reduce((sum, r) => sum + health[r], 0) / REGISTERS.length, 0, PHI);
    return health;
  }

  /**
   * Operational counters and derived scores
   */
  getStatus() {
    return {
      version: this.version,
      historyLength: this.history.length,
      subscriberCount: Array.from(this.subscribers.values()).reduce((sum, a) => sum + a.length, 0),
      peerCount: this.syncPeers.size,
      storeCount: this.stores.size,
      resonanceScore: this.getResonanceScore(),
      coherence: this.getCoherence(),
      entropy: this.getTotalEntropy(),
      registers: REGISTERS,
      dimensions: DIMENSIONS,
    };
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.state = {
      cognitive: { awareness: 1.0, coherence: 1.0, resonance: PHI_INV, entropy: 0.0 },
      affective: { awareness: PHI_INV, coherence: 1.0, resonance: 1.0, entropy: 0.0 },
      somatic:   { awareness: 1.0, coherence: PHI_INV, resonance: 1.0, entropy: 0.0 },
      sovereign: { awareness: PHI, coherence: PHI, resonance: PHI, entropy: 0.0 },
    };
    this.history = [];
    this.version = 0;
  }
}

// Export singleton and class
const nexorisEngine = new NexorisEngine();

export { NexorisEngine, nexorisEngine, REGISTERS, DIMENSIONS };
export default nexorisEngine;
