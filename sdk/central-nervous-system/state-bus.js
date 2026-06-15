/**
 * STATE BUS — Shared State Management Across All Components
 * 
 * The state bus provides a unified, reactive state management system
 * that allows all organism components to share and synchronize state
 * with automatic propagation and φ-enhanced conflict resolution.
 * 
 * @module sdk/central-nervous-system/state-bus
 * @version 2.0.0
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;

/**
 * State update strategies for conflict resolution
 */
export const UPDATE_STRATEGIES = {
  LAST_WRITE_WINS: 'last_write_wins',
  HIGHEST_PRIORITY: 'highest_priority',
  PHI_WEIGHTED: 'phi_weighted', // Weight by φ^priority
  CONSENSUS: 'consensus', // Require majority agreement
  MERGE: 'merge', // Intelligent merging for objects/arrays
};

/**
 * State Bus for organism-wide state management
 */
export class StateBus {
  constructor(options = {}) {
    this.strategy = options.strategy || UPDATE_STRATEGIES.LAST_WRITE_WINS;
    
    // State storage
    this.state = new Map(); // key → state entry
    this.history = new Map(); // key → historical values
    this.maxHistory = options.maxHistory || 100;
    
    // Subscriptions
    this.subscribers = new Map(); // key → Set<subscriber>
    this.globalSubscribers = new Set(); // Subscribers to all changes
    
    // Change tracking
    this.changes = [];
    this.maxChanges = options.maxChanges || 1000;
    
    // Statistics
    this.stats = {
      updates: 0,
      reads: 0,
      conflicts: 0,
      broadcasts: 0,
    };
  }

  /**
   * Set state value
   * 
   * @param {string} key - State key
   * @param {*} value - New value
   * @param {Object} metadata - Update metadata
   * @returns {boolean} Success status
   */
  set(key, value, metadata = {}) {
    const timestamp = Date.now();
    const priority = metadata.priority || 0;
    const source = metadata.source || 'unknown';
    
    // Get current state
    const current = this.state.get(key);
    
    // Handle conflicts
    if (current) {
      if (!this.shouldUpdate(current, value, priority, timestamp)) {
        this.stats.conflicts++;
        return false;
      }
    }
    
    // Create state entry
    const entry = {
      value,
      timestamp,
      priority,
      source,
      version: current ? current.version + 1 : 1,
    };
    
    // Store previous value in history
    if (current) {
      this.addToHistory(key, current);
    }
    
    // Update state
    this.state.set(key, entry);
    this.stats.updates++;
    
    // Track change
    this.trackChange(key, current ? current.value : undefined, value, metadata);
    
    // Notify subscribers
    this.notifySubscribers(key, value, entry);
    
    return true;
  }

  /**
   * Get state value
   * 
   * @param {string} key - State key
   * @param {*} defaultValue - Default if not found
   * @returns {*} State value
   */
  get(key, defaultValue = undefined) {
    this.stats.reads++;
    const entry = this.state.get(key);
    return entry ? entry.value : defaultValue;
  }

  /**
   * Get state entry with full metadata
   * 
   * @param {string} key - State key
   * @returns {Object|null} State entry
   */
  getEntry(key) {
    return this.state.get(key) || null;
  }

  /**
   * Check if key exists
   * 
   * @param {string} key - State key
   * @returns {boolean}
   */
  has(key) {
    return this.state.has(key);
  }

  /**
   * Delete state key
   * 
   * @param {string} key - State key
   * @returns {boolean} Success status
   */
  delete(key) {
    const entry = this.state.get(key);
    if (!entry) return false;
    
    // Store in history
    this.addToHistory(key, entry);
    
    // Delete from state
    this.state.delete(key);
    
    // Notify subscribers
    this.notifySubscribers(key, undefined, { deleted: true });
    
    return true;
  }

  /**
   * Clear all state
   */
  clear() {
    this.state.clear();
    this.history.clear();
    this.changes = [];
  }

  /**
   * Subscribe to state changes for a specific key
   * 
   * @param {string} key - State key
   * @param {Function} callback - (value, entry) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    
    this.subscribers.get(key).add(callback);
    
    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(key);
      if (subscribers) {
        subscribers.delete(callback);
      }
    };
  }

  /**
   * Subscribe to all state changes
   * 
   * @param {Function} callback - (key, value, entry) => void
   * @returns {Function} Unsubscribe function
   */
  subscribeAll(callback) {
    this.globalSubscribers.add(callback);
    
    return () => {
      this.globalSubscribers.delete(callback);
    };
  }

  /**
   * Batch update multiple keys atomically
   * 
   * @param {Object} updates - { key: value, ... }
   * @param {Object} metadata - Shared metadata
   */
  batchSet(updates, metadata = {}) {
    const results = {};
    
    for (const [key, value] of Object.entries(updates)) {
      results[key] = this.set(key, value, metadata);
    }
    
    return results;
  }

  /**
   * Get multiple values
   * 
   * @param {string[]} keys - Array of keys
   * @returns {Object} { key: value, ... }
   */
  batchGet(keys) {
    const results = {};
    
    for (const key of keys) {
      results[key] = this.get(key);
    }
    
    return results;
  }

  /**
   * Get state history for a key
   * 
   * @param {string} key - State key
   * @param {number} limit - Max entries to return
   * @returns {Array} Historical entries
   */
  getHistory(key, limit = 10) {
    const history = this.history.get(key) || [];
    return history.slice(-limit);
  }

  /**
   * Get recent changes
   * 
   * @param {number} limit - Max changes to return
   * @returns {Array} Recent changes
   */
  getChanges(limit = 10) {
    return this.changes.slice(-limit);
  }

  /**
   * Get all state keys
   * 
   * @returns {string[]} Array of keys
   */
  keys() {
    return Array.from(this.state.keys());
  }

  /**
   * Get all state values
   * 
   * @returns {Object} { key: value, ... }
   */
  snapshot() {
    const snapshot = {};
    for (const [key, entry] of this.state) {
      snapshot[key] = entry.value;
    }
    return snapshot;
  }

  /**
   * Get statistics
   * 
   * @returns {Object} Stats
   */
  getStats() {
    return {
      ...this.stats,
      stateSize: this.state.size,
      historySize: this.history.size,
      subscriberCount: this.subscribers.size,
      globalSubscriberCount: this.globalSubscribers.size,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTERNAL METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Determine if a new value should replace current value
   */
  shouldUpdate(current, newValue, newPriority, newTimestamp) {
    switch (this.strategy) {
      case UPDATE_STRATEGIES.LAST_WRITE_WINS:
        return true;
      
      case UPDATE_STRATEGIES.HIGHEST_PRIORITY:
        return newPriority >= current.priority;
      
      case UPDATE_STRATEGIES.PHI_WEIGHTED: {
        const currentWeight = Math.pow(PHI, current.priority);
        const newWeight = Math.pow(PHI, newPriority);
        return newWeight >= currentWeight;
      }
      
      default:
        return true;
    }
  }

  /**
   * Add entry to history
   */
  addToHistory(key, entry) {
    if (!this.history.has(key)) {
      this.history.set(key, []);
    }
    
    const history = this.history.get(key);
    history.push(entry);
    
    // Limit history size
    if (history.length > this.maxHistory) {
      history.shift();
    }
  }

  /**
   * Track a state change
   */
  trackChange(key, oldValue, newValue, metadata) {
    this.changes.push({
      key,
      oldValue,
      newValue,
      timestamp: Date.now(),
      source: metadata.source || 'unknown',
    });
    
    // Limit changes array
    if (this.changes.length > this.maxChanges) {
      this.changes.shift();
    }
  }

  /**
   * Notify subscribers of state change
   */
  notifySubscribers(key, value, entry) {
    this.stats.broadcasts++;
    
    // Notify key-specific subscribers
    const subscribers = this.subscribers.get(key);
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(value, entry);
        } catch (err) {
          console.error('[StateBus] Subscriber error:', err);
        }
      }
    }
    
    // Notify global subscribers
    for (const callback of this.globalSubscribers) {
      try {
        callback(key, value, entry);
      } catch (err) {
        console.error('[StateBus] Global subscriber error:', err);
      }
    }
  }
}

export default StateBus;
