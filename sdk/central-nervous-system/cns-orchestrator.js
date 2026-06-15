/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  CENTRAL NERVOUS SYSTEM (CNS) ORCHESTRATOR                                    ║
 * ║  The Unified Coordinator for All Organism Components                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * The CNS is the organism's unified coordination layer that:
 * - Connects all subsystems (engines, agents, organs, protocols)
 * - Routes signals between components with φ-enhanced pathways
 * - Synchronizes state across the entire organism
 * - Provides automatic failure detection and self-healing
 * - Maintains the unified heartbeat (873ms × φ)
 * 
 * @module sdk/central-nervous-system
 * @version 2.0.0
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT_MS = 873;

/**
 * Signal types that flow through the CNS
 */
export const SIGNAL_TYPES = {
  // Sensory signals (from environment to SENSUS)
  SENSORY_INPUT: 'sensory_input',
  
  // Cognitive signals (between agents)
  THOUGHT: 'thought',
  DECISION: 'decision',
  ATTENTION: 'attention',
  
  // Motor signals (from CORPUS to environment)
  ACTION: 'action',
  
  // Memory signals
  MEMORY_STORE: 'memory_store',
  MEMORY_RETRIEVE: 'memory_retrieve',
  
  // System signals
  HEARTBEAT: 'heartbeat',
  STATUS_CHECK: 'status_check',
  ERROR: 'error',
  
  // Organ signals
  POWER_REQUEST: 'power_request',
  THERMAL_ALERT: 'thermal_alert',
  SECURITY_THREAT: 'security_threat',
  RESOURCE_UPDATE: 'resource_update',
  
  // Protocol signals
  PROTOCOL_SELECT: 'protocol_select',
  PROTOCOL_SWITCH: 'protocol_switch',
};

/**
 * Component types in the organism
 */
export const COMPONENT_TYPES = {
  ENGINE: 'engine',
  AGENT: 'agent',
  ORGAN: 'organ',
  PROTOCOL: 'protocol',
  ARM: 'arm',
};

/**
 * CNS connection status
 */
export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DEGRADED: 'degraded',
  FAILED: 'failed',
};

/**
 * Central Nervous System Orchestrator
 * 
 * This is the organism's neural hub that connects everything together.
 */
export class CNSOrchestrator {
  constructor() {
    this.id = 'CNS';
    this.version = '2.0.0';
    
    // Component registry
    this.components = new Map(); // componentId → component
    this.componentTypes = new Map(); // componentId → type
    this.connections = new Map(); // componentId → status
    
    // Signal routing
    this.signalHandlers = new Map(); // signalType → Set<componentId>
    this.signalQueue = [];
    this.processingSignals = false;
    
    // State synchronization
    this.sharedState = new Map(); // key → value
    this.stateSubscribers = new Map(); // key → Set<componentId>
    
    // Heartbeat coordination
    this.heartbeatInterval = null;
    this.heartbeatCount = 0;
    this.heartbeatSubscribers = new Set();
    
    // Health monitoring
    this.componentHealth = new Map(); // componentId → health metrics
    this.failureDetection = new Map(); // componentId → failure count
    
    // Statistics
    this.stats = {
      signalsRouted: 0,
      componentsRegistered: 0,
      heartbeatsEmitted: 0,
      failuresDetected: 0,
      selfHealingEvents: 0,
    };
    
    this.active = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Activate the CNS and start coordinating all systems
   */
  activate() {
    if (this.active) return;
    this.active = true;
    
    // Start unified heartbeat
    this.startHeartbeat();
    
    // Start signal processing loop
    this.startSignalProcessing();
    
    console.log(`[CNS] Central Nervous System activated (v${this.version})`);
  }

  /**
   * Deactivate the CNS and gracefully shut down
   */
  deactivate() {
    if (!this.active) return;
    this.active = false;
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Stop signal processing
    this.processingSignals = false;
    
    // Disconnect all components
    for (const [componentId] of this.components) {
      this.disconnect(componentId);
    }
    
    console.log('[CNS] Central Nervous System deactivated');
  }

  /**
   * Check if CNS is active
   */
  isActive() {
    return this.active;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COMPONENT REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Register a component with the CNS
   * 
   * @param {string} componentId - Unique identifier
   * @param {Object} component - The component instance
   * @param {string} type - Component type (from COMPONENT_TYPES)
   * @returns {boolean} Success status
   */
  register(componentId, component, type) {
    if (this.components.has(componentId)) {
      console.warn(`[CNS] Component ${componentId} already registered`);
      return false;
    }
    
    this.components.set(componentId, component);
    this.componentTypes.set(componentId, type);
    this.connections.set(componentId, CONNECTION_STATUS.CONNECTED);
    this.componentHealth.set(componentId, {
      status: 'healthy',
      lastCheck: Date.now(),
      uptime: 0,
    });
    
    this.stats.componentsRegistered++;
    
    console.log(`[CNS] Registered ${type} component: ${componentId}`);
    return true;
  }

  /**
   * Unregister a component from the CNS
   */
  unregister(componentId) {
    if (!this.components.has(componentId)) return false;
    
    this.disconnect(componentId);
    this.components.delete(componentId);
    this.componentTypes.delete(componentId);
    this.connections.delete(componentId);
    this.componentHealth.delete(componentId);
    
    console.log(`[CNS] Unregistered component: ${componentId}`);
    return true;
  }

  /**
   * Get a registered component
   */
  getComponent(componentId) {
    return this.components.get(componentId);
  }

  /**
   * Get all components of a specific type
   */
  getComponentsByType(type) {
    const result = [];
    for (const [componentId, componentType] of this.componentTypes) {
      if (componentType === type) {
        result.push({
          id: componentId,
          component: this.components.get(componentId),
          status: this.connections.get(componentId),
        });
      }
    }
    return result;
  }

  /**
   * Check if component is registered
   */
  hasComponent(componentId) {
    return this.components.has(componentId);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONNECTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Mark a component as connected
   */
  connect(componentId) {
    if (!this.components.has(componentId)) return false;
    
    this.connections.set(componentId, CONNECTION_STATUS.CONNECTED);
    this.failureDetection.set(componentId, 0);
    
    return true;
  }

  /**
   * Mark a component as disconnected
   */
  disconnect(componentId) {
    if (!this.components.has(componentId)) return false;
    
    this.connections.set(componentId, CONNECTION_STATUS.DISCONNECTED);
    
    // Remove from signal handlers
    for (const [, subscribers] of this.signalHandlers) {
      subscribers.delete(componentId);
    }
    
    // Remove from state subscribers
    for (const [, subscribers] of this.stateSubscribers) {
      subscribers.delete(componentId);
    }
    
    // Remove from heartbeat subscribers
    this.heartbeatSubscribers.delete(componentId);
    
    return true;
  }

  /**
   * Get connection status of a component
   */
  getConnectionStatus(componentId) {
    return this.connections.get(componentId) || CONNECTION_STATUS.DISCONNECTED;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SIGNAL ROUTING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe a component to receive specific signal types
   */
  subscribeToSignals(componentId, signalTypes) {
    if (!this.components.has(componentId)) {
      throw new Error(`Component ${componentId} not registered`);
    }
    
    const types = Array.isArray(signalTypes) ? signalTypes : [signalTypes];
    
    for (const signalType of types) {
      if (!this.signalHandlers.has(signalType)) {
        this.signalHandlers.set(signalType, new Set());
      }
      this.signalHandlers.get(signalType).add(componentId);
    }
  }

  /**
   * Unsubscribe a component from signal types
   */
  unsubscribeFromSignals(componentId, signalTypes) {
    const types = Array.isArray(signalTypes) ? signalTypes : [signalTypes];
    
    for (const signalType of types) {
      const subscribers = this.signalHandlers.get(signalType);
      if (subscribers) {
        subscribers.delete(componentId);
      }
    }
  }

  /**
   * Send a signal through the CNS
   * 
   * @param {string} signalType - Type of signal
   * @param {Object} payload - Signal data
   * @param {string} sourceId - Component ID that sent the signal
   * @param {Object} options - Routing options
   */
  sendSignal(signalType, payload, sourceId, options = {}) {
    const signal = {
      type: signalType,
      payload,
      source: sourceId,
      timestamp: Date.now(),
      id: `${signalType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      priority: options.priority || 0,
      targetId: options.targetId || null, // Direct routing
    };
    
    // Add to queue
    this.signalQueue.push(signal);
    
    // Sort by priority (φ-enhanced: higher priority = φ^n weight)
    this.signalQueue.sort((a, b) => {
      const weightA = Math.pow(PHI, a.priority);
      const weightB = Math.pow(PHI, b.priority);
      return weightB - weightA;
    });
    
    return signal.id;
  }

  /**
   * Process signal queue (runs continuously)
   */
  async startSignalProcessing() {
    this.processingSignals = true;
    
    const processLoop = async () => {
      while (this.processingSignals && this.active) {
        if (this.signalQueue.length > 0) {
          const signal = this.signalQueue.shift();
          await this.routeSignal(signal);
        }
        
        // Brief pause (φ-enhanced)
        await new Promise(resolve => setTimeout(resolve, Math.floor(HEARTBEAT_MS * PHI_INV)));
      }
    };
    
    processLoop();
  }

  /**
   * Route a signal to its subscribers
   */
  async routeSignal(signal) {
    this.stats.signalsRouted++;
    
    // Direct routing to specific target
    if (signal.targetId) {
      const component = this.components.get(signal.targetId);
      if (component && this.connections.get(signal.targetId) === CONNECTION_STATUS.CONNECTED) {
        await this.deliverSignal(signal, signal.targetId, component);
      }
      return;
    }
    
    // Broadcast to all subscribers of this signal type
    const subscribers = this.signalHandlers.get(signal.type);
    if (subscribers) {
      for (const componentId of subscribers) {
        const component = this.components.get(componentId);
        const status = this.connections.get(componentId);
        
        if (component && status === CONNECTION_STATUS.CONNECTED) {
          await this.deliverSignal(signal, componentId, component);
        }
      }
    }
  }

  /**
   * Deliver signal to a component
   */
  async deliverSignal(signal, componentId, component) {
    try {
      // Try standard onSignal method
      if (typeof component.onSignal === 'function') {
        await component.onSignal(signal);
      }
      // Try handleCNSSignal method (alternative interface)
      else if (typeof component.handleCNSSignal === 'function') {
        await component.handleCNSSignal(signal);
      }
    } catch (err) {
      console.error(`[CNS] Error delivering signal to ${componentId}:`, err);
      this.handleComponentFailure(componentId, err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE SYNCHRONIZATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Set shared state value
   */
  setState(key, value, sourceId) {
    this.sharedState.set(key, {
      value,
      source: sourceId,
      timestamp: Date.now(),
    });
    
    // Notify subscribers
    const subscribers = this.stateSubscribers.get(key);
    if (subscribers) {
      for (const componentId of subscribers) {
        const component = this.components.get(componentId);
        if (component && typeof component.onStateChange === 'function') {
          try {
            component.onStateChange(key, value, sourceId);
          } catch (err) {
            console.error(`[CNS] Error notifying ${componentId} of state change:`, err);
          }
        }
      }
    }
  }

  /**
   * Get shared state value
   */
  getState(key) {
    const entry = this.sharedState.get(key);
    return entry ? entry.value : undefined;
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState(componentId, keys) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    
    for (const key of keyArray) {
      if (!this.stateSubscribers.has(key)) {
        this.stateSubscribers.set(key, new Set());
      }
      this.stateSubscribers.get(key).add(componentId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // UNIFIED HEARTBEAT
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Start the unified heartbeat (873ms × φ)
   */
  startHeartbeat() {
    if (this.heartbeatInterval) return;
    
    const interval = Math.floor(HEARTBEAT_MS * PHI);
    
    this.heartbeatInterval = setInterval(() => {
      this.emitHeartbeat();
    }, interval);
  }

  /**
   * Stop the heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Emit heartbeat to all subscribers
   */
  emitHeartbeat() {
    this.heartbeatCount++;
    this.stats.heartbeatsEmitted++;
    
    const heartbeat = {
      count: this.heartbeatCount,
      timestamp: Date.now(),
      phi: PHI,
      interval: Math.floor(HEARTBEAT_MS * PHI),
    };
    
    // Send heartbeat signal
    this.sendSignal(SIGNAL_TYPES.HEARTBEAT, heartbeat, 'CNS', { priority: 10 });
    
    // Also call direct heartbeat handlers
    for (const componentId of this.heartbeatSubscribers) {
      const component = this.components.get(componentId);
      if (component && typeof component.onHeartbeat === 'function') {
        try {
          component.onHeartbeat(heartbeat);
        } catch (err) {
          console.error(`[CNS] Error in heartbeat handler for ${componentId}:`, err);
        }
      }
    }
  }

  /**
   * Subscribe to heartbeat
   */
  subscribeToHeartbeat(componentId) {
    if (!this.components.has(componentId)) {
      throw new Error(`Component ${componentId} not registered`);
    }
    this.heartbeatSubscribers.add(componentId);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HEALTH MONITORING & SELF-HEALING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Check health of all components
   */
  async checkHealth() {
    for (const [componentId, component] of this.components) {
      try {
        let health = { status: 'unknown' };
        
        // Try to get health status
        if (typeof component.getHealth === 'function') {
          health = await component.getHealth();
        } else if (typeof component.health !== 'undefined') {
          health = component.health;
        } else {
          health = { status: 'healthy' }; // Assume healthy if no health check
        }
        
        this.componentHealth.set(componentId, {
          ...health,
          lastCheck: Date.now(),
        });
        
        // Detect degraded or failed components
        if (health.status === 'degraded') {
          this.connections.set(componentId, CONNECTION_STATUS.DEGRADED);
        } else if (health.status === 'failed') {
          this.handleComponentFailure(componentId, new Error('Component health check failed'));
        }
      } catch (err) {
        console.error(`[CNS] Health check failed for ${componentId}:`, err);
        this.handleComponentFailure(componentId, err);
      }
    }
  }

  /**
   * Handle component failure
   */
  handleComponentFailure(componentId, error) {
    this.stats.failuresDetected++;
    
    const failureCount = (this.failureDetection.get(componentId) || 0) + 1;
    this.failureDetection.set(componentId, failureCount);
    
    console.error(`[CNS] Component ${componentId} failure (count: ${failureCount}):`, error);
    
    // Mark as failed
    this.connections.set(componentId, CONNECTION_STATUS.FAILED);
    
    // Attempt self-healing
    if (failureCount < 3) {
      this.attemptSelfHealing(componentId);
    } else {
      console.error(`[CNS] Component ${componentId} exceeded failure threshold, disconnecting`);
      this.disconnect(componentId);
    }
  }

  /**
   * Attempt to self-heal a failed component
   */
  async attemptSelfHealing(componentId) {
    console.log(`[CNS] Attempting self-healing for ${componentId}`);
    this.stats.selfHealingEvents++;
    
    const component = this.components.get(componentId);
    if (!component) return;
    
    try {
      // Try to restart the component
      if (typeof component.restart === 'function') {
        await component.restart();
      } else if (typeof component.shutdown === 'function' && typeof component.awaken === 'function') {
        await component.shutdown();
        await component.awaken();
      }
      
      // Mark as connected if successful
      this.connections.set(componentId, CONNECTION_STATUS.CONNECTED);
      this.failureDetection.set(componentId, 0);
      
      console.log(`[CNS] Successfully healed ${componentId}`);
    } catch (err) {
      console.error(`[CNS] Self-healing failed for ${componentId}:`, err);
    }
  }

  /**
   * Get health status of all components
   */
  getHealthStatus() {
    const status = {
      active: this.active,
      components: {},
      stats: { ...this.stats },
    };
    
    for (const [componentId, health] of this.componentHealth) {
      status.components[componentId] = {
        type: this.componentTypes.get(componentId),
        connection: this.connections.get(componentId),
        health,
        failures: this.failureDetection.get(componentId) || 0,
      };
    }
    
    return status;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get CNS statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeComponents: this.components.size,
      signalQueueLength: this.signalQueue.length,
      heartbeatCount: this.heartbeatCount,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      signalsRouted: 0,
      componentsRegistered: this.stats.componentsRegistered, // Preserve
      heartbeatsEmitted: 0,
      failuresDetected: 0,
      selfHealingEvents: 0,
    };
  }
}

export default CNSOrchestrator;
