/**
 * 🔄 FLOW STATE MACHINE — Multi-Flow State Modeling & Execution
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A robust state machine for managing complex multi-flow execution patterns.
 * Supports:
 *   - State transitions with guards and actions
 *   - Parallel flow execution with dependencies
 *   - Hierarchical states (substates)
 *   - Event-driven transitions
 *   - Phi-encoded timing and resonance
 *
 * Integrates with:
 *   - AUTO Orchestrator (heartbeat loop)
 *   - Divergence Tracker (metrics)
 *   - Evolution Engine (fitness)
 *   - Agent Registry (health)
 *
 * id: atlas://organism/flow-state-machine
 * class: T1-SOVEREIGN
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT_MS = 873;

// ── Flow States ───────────────────────────────────────────────────────────────

/**
 * @typedef {'idle'|'initializing'|'running'|'paused'|'completed'|'failed'|'healing'} FlowState
 */

/**
 * @typedef {'pending'|'queued'|'executing'|'blocked'|'done'|'error'} TaskState
 */

// ── State Transition Definitions ──────────────────────────────────────────────

const STATE_TRANSITIONS = {
  idle: {
    START: 'initializing',
    RESET: 'idle',
  },
  initializing: {
    INITIALIZED: 'running',
    ERROR: 'failed',
    ABORT: 'idle',
  },
  running: {
    PAUSE: 'paused',
    COMPLETE: 'completed',
    ERROR: 'failed',
    DEGRADE: 'healing',
  },
  paused: {
    RESUME: 'running',
    ABORT: 'idle',
    ERROR: 'failed',
  },
  completed: {
    RESET: 'idle',
    RESTART: 'initializing',
  },
  failed: {
    RESET: 'idle',
    RETRY: 'initializing',
    HEAL: 'healing',
  },
  healing: {
    HEALED: 'running',
    ERROR: 'failed',
    ABORT: 'idle',
  },
};

// ── Flow Node (represents a unit of work in the flow) ─────────────────────────

/**
 * @typedef {Object} FlowNode
 * @property {string} id - Unique node identifier
 * @property {string} type - Node type (task|checkpoint|decision|parallel|sequence)
 * @property {string} name - Human-readable name
 * @property {TaskState} state - Current task state
 * @property {string[]} dependencies - IDs of nodes that must complete first
 * @property {Function|null} execute - Execution function
 * @property {Function|null} guard - Guard condition function
 * @property {Function|null} onEnter - Callback when entering node
 * @property {Function|null} onExit - Callback when exiting node
 * @property {Object} context - Node-specific context data
 * @property {number} startedAt - Execution start timestamp
 * @property {number} completedAt - Execution complete timestamp
 * @property {number} retryCount - Number of retry attempts
 * @property {number} maxRetries - Maximum retry attempts
 * @property {Object|null} result - Execution result
 * @property {Object|null} error - Error if failed
 */

/**
 * @typedef {Object} FlowDefinition
 * @property {string} id - Flow identifier
 * @property {string} name - Flow name
 * @property {string} description - Flow description
 * @property {FlowNode[]} nodes - Flow nodes
 * @property {Object} edges - Directed edges (node id -> next node ids)
 * @property {string} entryNode - Initial node ID
 * @property {string[]} exitNodes - Terminal node IDs
 * @property {Object} metadata - Additional flow metadata
 */

// ── Flow State Machine Class ──────────────────────────────────────────────────

class FlowStateMachine {
  /**
   * @param {Object} config - Configuration
   * @param {string} [config.id] - Machine ID
   * @param {string} [config.name] - Machine name
   * @param {number} [config.maxConcurrent=5] - Max concurrent node executions
   * @param {number} [config.defaultTimeout=30000] - Default node timeout
   * @param {boolean} [config.enableMetrics=true] - Enable metrics collection
   */
  constructor(config = {}) {
    this.id = config.id || `fsm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.name = config.name || 'FlowStateMachine';
    this.maxConcurrent = config.maxConcurrent || 5;
    this.defaultTimeout = config.defaultTimeout || 30000;
    this.enableMetrics = config.enableMetrics !== false;

    /** @type {FlowState} */
    this.state = 'idle';

    /** @type {Map<string, FlowNode>} */
    this.nodes = new Map();

    /** @type {Map<string, string[]>} */
    this.edges = new Map();

    /** @type {Set<string>} */
    this.activeNodes = new Set();

    /** @type {Set<string>} */
    this.completedNodes = new Set();

    /** @type {string|null} */
    this.entryNode = null;

    /** @type {Set<string>} */
    this.exitNodes = new Set();

    /** @type {Object[]} */
    this.eventLog = [];

    /** @type {Object} */
    this.context = {};

    /** @type {Object} */
    this.metrics = {
      totalTransitions: 0,
      totalNodesExecuted: 0,
      totalNodesSucceeded: 0,
      totalNodesFailed: 0,
      totalRetries: 0,
      averageNodeDuration: 0,
      flowsCompleted: 0,
      flowsFailed: 0,
      lastPulseTime: 0,
      pulseCount: 0,
      phiResonance: PHI_INV,
    };

    this.startedAt = null;
    this.completedAt = null;
    this.heartbeatTimer = null;
  }

  // ── State Management ────────────────────────────────────────────────────────

  /**
   * Get current flow state.
   * @returns {FlowState}
   */
  getState() {
    return this.state;
  }

  /**
   * Attempt a state transition.
   * @param {string} event - The triggering event
   * @returns {{ success: boolean, from: FlowState, to: FlowState, event: string }}
   */
  transition(event) {
    const transitions = STATE_TRANSITIONS[this.state];
    if (!transitions || !transitions[event]) {
      this._log('transition-rejected', `No transition for event "${event}" from state "${this.state}"`);
      return { success: false, from: this.state, to: this.state, event };
    }

    const from = this.state;
    const to = transitions[event];

    this.state = to;
    this.metrics.totalTransitions++;

    this._log('transition', `${from} → ${to} (${event})`);

    return { success: true, from, to, event };
  }

  /**
   * Check if a transition is valid.
   * @param {string} event - The event to check
   * @returns {boolean}
   */
  canTransition(event) {
    const transitions = STATE_TRANSITIONS[this.state];
    return !!(transitions && transitions[event]);
  }

  // ── Flow Definition ─────────────────────────────────────────────────────────

  /**
   * Load a flow definition.
   * @param {FlowDefinition} definition - The flow definition
   * @returns {{ success: boolean, nodesLoaded: number, edgesLoaded: number }}
   */
  loadFlow(definition) {
    this.nodes.clear();
    this.edges.clear();
    this.activeNodes.clear();
    this.completedNodes.clear();
    this.exitNodes.clear();

    this.id = definition.id || this.id;
    this.name = definition.name || this.name;
    this.context = { ...(definition.metadata || {}) };

    // Load nodes
    for (const nodeDef of (definition.nodes || [])) {
      const node = this._createNode(nodeDef);
      this.nodes.set(node.id, node);
    }

    // Load edges
    for (const [fromId, toIds] of Object.entries(definition.edges || {})) {
      this.edges.set(fromId, Array.isArray(toIds) ? toIds : [toIds]);
    }

    // Set entry and exit nodes
    this.entryNode = definition.entryNode || (definition.nodes?.[0]?.id || null);
    for (const exitId of (definition.exitNodes || [])) {
      this.exitNodes.add(exitId);
    }

    this._log('flow-loaded', `Loaded ${this.nodes.size} nodes, ${this.edges.size} edges`);

    return {
      success: true,
      nodesLoaded: this.nodes.size,
      edgesLoaded: this.edges.size,
    };
  }

  /**
   * Create a node from a definition.
   * @private
   * @param {Object} def - Node definition
   * @returns {FlowNode}
   */
  _createNode(def) {
    return {
      id: def.id || `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: def.type || 'task',
      name: def.name || 'Unnamed Node',
      state: 'pending',
      dependencies: def.dependencies || [],
      execute: typeof def.execute === 'function' ? def.execute : null,
      guard: typeof def.guard === 'function' ? def.guard : null,
      onEnter: typeof def.onEnter === 'function' ? def.onEnter : null,
      onExit: typeof def.onExit === 'function' ? def.onExit : null,
      context: def.context || {},
      startedAt: 0,
      completedAt: 0,
      retryCount: 0,
      maxRetries: def.maxRetries || 3,
      result: null,
      error: null,
    };
  }

  /**
   * Add a single node to the flow.
   * @param {Object} nodeDef - Node definition
   * @returns {FlowNode}
   */
  addNode(nodeDef) {
    const node = this._createNode(nodeDef);
    this.nodes.set(node.id, node);
    this._log('node-added', `Added node ${node.id}: ${node.name}`);
    return node;
  }

  /**
   * Add an edge between nodes.
   * @param {string} fromId - Source node ID
   * @param {string} toId - Target node ID
   */
  addEdge(fromId, toId) {
    const existing = this.edges.get(fromId) || [];
    if (!existing.includes(toId)) {
      existing.push(toId);
      this.edges.set(fromId, existing);
    }
  }

  // ── Flow Execution ──────────────────────────────────────────────────────────

  /**
   * Start flow execution.
   * @returns {{ success: boolean, state: FlowState }}
   */
  start() {
    if (this.state !== 'idle') {
      return { success: false, state: this.state, error: 'Flow not in idle state' };
    }

    this.transition('START');
    this.startedAt = Date.now();
    this.completedAt = null;
    this.completedNodes.clear();
    this.activeNodes.clear();

    // Reset all nodes
    for (const node of this.nodes.values()) {
      node.state = 'pending';
      node.startedAt = 0;
      node.completedAt = 0;
      node.result = null;
      node.error = null;
    }

    // Initialize complete
    this.transition('INITIALIZED');

    this._log('flow-started', `Flow ${this.name} started`);

    return { success: true, state: this.state };
  }

  /**
   * Execute one pulse of the flow (called on heartbeat).
   * This is the main execution driver - processes ready nodes in parallel.
   * @returns {Object} - Pulse result with status
   */
  pulse() {
    const pulseStart = Date.now();
    this.metrics.pulseCount++;

    if (this.state !== 'running') {
      return { processed: 0, state: this.state, reason: 'not-running' };
    }

    // Find nodes that are ready to execute
    const readyNodes = this._findReadyNodes();

    // Limit concurrent executions
    const toExecute = readyNodes.slice(0, this.maxConcurrent - this.activeNodes.size);

    // Execute ready nodes
    const results = [];
    for (const node of toExecute) {
      const result = this._executeNode(node);
      results.push(result);
    }

    // Check for completion or failure
    this._checkFlowCompletion();

    // Update metrics with phi-decay
    const pulseDuration = Date.now() - pulseStart;
    this.metrics.lastPulseTime = pulseDuration;
    this.metrics.phiResonance = this.metrics.phiResonance * PHI_INV + (pulseDuration / HEARTBEAT_MS) * (1 - PHI_INV);

    return {
      processed: results.length,
      active: this.activeNodes.size,
      completed: this.completedNodes.size,
      total: this.nodes.size,
      state: this.state,
      pulseDuration,
    };
  }

  /**
   * Find nodes that are ready to execute.
   * @private
   * @returns {FlowNode[]}
   */
  _findReadyNodes() {
    const ready = [];

    for (const node of this.nodes.values()) {
      if (node.state !== 'pending') continue;
      if (this.activeNodes.has(node.id)) continue;

      // Check dependencies
      const depsComplete = node.dependencies.every(depId => this.completedNodes.has(depId));
      if (!depsComplete) continue;

      // Check guard condition
      if (node.guard) {
        try {
          if (!node.guard(node, this.context)) continue;
        } catch (e) {
          this._log('guard-error', `Guard error for node ${node.id}: ${e.message}`);
          continue;
        }
      }

      ready.push(node);
    }

    return ready;
  }

  /**
   * Execute a single node.
   * @private
   * @param {FlowNode} node
   * @returns {Object}
   */
  _executeNode(node) {
    node.state = 'executing';
    node.startedAt = Date.now();
    this.activeNodes.add(node.id);

    this._log('node-started', `Executing node ${node.id}: ${node.name}`);

    // Call onEnter
    if (node.onEnter) {
      try {
        node.onEnter(node, this.context);
      } catch (e) {
        this._log('onEnter-error', `onEnter error for ${node.id}: ${e.message}`);
      }
    }

    // Execute the node
    try {
      if (node.execute) {
        node.result = node.execute(node, this.context);
      } else {
        // No-op node (checkpoint, etc)
        node.result = { success: true, message: 'No-op node' };
      }

      node.state = 'done';
      node.completedAt = Date.now();
      this.activeNodes.delete(node.id);
      this.completedNodes.add(node.id);
      this.metrics.totalNodesSucceeded++;

      this._log('node-completed', `Node ${node.id} completed in ${node.completedAt - node.startedAt}ms`);

    } catch (e) {
      node.error = { message: e.message, stack: e.stack };

      // Retry logic
      if (node.retryCount < node.maxRetries) {
        node.retryCount++;
        node.state = 'pending';
        this.metrics.totalRetries++;
        this._log('node-retry', `Retrying node ${node.id} (attempt ${node.retryCount}/${node.maxRetries})`);
      } else {
        node.state = 'error';
        node.completedAt = Date.now();
        this.metrics.totalNodesFailed++;
        this._log('node-failed', `Node ${node.id} failed: ${e.message}`);
      }

      this.activeNodes.delete(node.id);
    }

    // Call onExit
    if (node.onExit) {
      try {
        node.onExit(node, this.context);
      } catch (e) {
        this._log('onExit-error', `onExit error for ${node.id}: ${e.message}`);
      }
    }

    this.metrics.totalNodesExecuted++;

    // Update average duration with phi-smoothing
    const duration = node.completedAt - node.startedAt;
    this.metrics.averageNodeDuration = 
      this.metrics.averageNodeDuration * PHI_INV + duration * (1 - PHI_INV);

    return {
      nodeId: node.id,
      state: node.state,
      duration,
      result: node.result,
      error: node.error,
    };
  }

  /**
   * Check if the flow has completed (success or failure).
   * @private
   */
  _checkFlowCompletion() {
    // Check for failures
    const failedNodes = Array.from(this.nodes.values()).filter(n => n.state === 'error');
    if (failedNodes.length > 0) {
      this.transition('ERROR');
      this.completedAt = Date.now();
      this.metrics.flowsFailed++;
      this._log('flow-failed', `Flow failed with ${failedNodes.length} failed nodes`);
      return;
    }

    // Check for completion
    const allComplete = Array.from(this.nodes.values()).every(
      n => n.state === 'done' || n.state === 'error'
    );

    if (allComplete) {
      this.transition('COMPLETE');
      this.completedAt = Date.now();
      this.metrics.flowsCompleted++;
      this._log('flow-completed', `Flow completed successfully`);
    }
  }

  // ── Flow Control ────────────────────────────────────────────────────────────

  /**
   * Pause the flow execution.
   * @returns {{ success: boolean, state: FlowState }}
   */
  pause() {
    if (!this.canTransition('PAUSE')) {
      return { success: false, state: this.state };
    }
    this.transition('PAUSE');
    this._log('flow-paused', 'Flow paused');
    return { success: true, state: this.state };
  }

  /**
   * Resume a paused flow.
   * @returns {{ success: boolean, state: FlowState }}
   */
  resume() {
    if (!this.canTransition('RESUME')) {
      return { success: false, state: this.state };
    }
    this.transition('RESUME');
    this._log('flow-resumed', 'Flow resumed');
    return { success: true, state: this.state };
  }

  /**
   * Reset the flow to idle state.
   * @returns {{ success: boolean, state: FlowState }}
   */
  reset() {
    if (!this.canTransition('RESET')) {
      return { success: false, state: this.state };
    }
    this.transition('RESET');
    this.activeNodes.clear();
    this.completedNodes.clear();
    this._log('flow-reset', 'Flow reset to idle');
    return { success: true, state: this.state };
  }

  /**
   * Attempt to heal the flow after an error.
   * @returns {{ success: boolean, state: FlowState, healed: string[] }}
   */
  heal() {
    if (!this.canTransition('HEAL')) {
      return { success: false, state: this.state, healed: [] };
    }

    this.transition('HEAL');
    const healed = [];

    // Reset failed nodes that haven't exhausted retries
    for (const node of this.nodes.values()) {
      if (node.state === 'error' && node.retryCount < node.maxRetries) {
        node.state = 'pending';
        node.error = null;
        healed.push(node.id);
        this._log('node-healed', `Node ${node.id} reset for retry`);
      }
    }

    if (healed.length > 0) {
      this.transition('HEALED');
      this._log('flow-healed', `Healed ${healed.length} nodes`);
    } else {
      this.transition('ERROR');
      this._log('heal-failed', 'No nodes could be healed');
    }

    return { success: healed.length > 0, state: this.state, healed };
  }

  // ── Querying ────────────────────────────────────────────────────────────────

  /**
   * Get the status of a specific node.
   * @param {string} nodeId
   * @returns {FlowNode|null}
   */
  getNode(nodeId) {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * Get all nodes with a specific state.
   * @param {TaskState} state
   * @returns {FlowNode[]}
   */
  getNodesInState(state) {
    return Array.from(this.nodes.values()).filter(n => n.state === state);
  }

  /**
   * Get flow progress as a percentage.
   * @returns {number}
   */
  getProgress() {
    if (this.nodes.size === 0) return 0;
    return Math.round((this.completedNodes.size / this.nodes.size) * 100);
  }

  /**
   * Get comprehensive flow status.
   * @returns {Object}
   */
  getStatus() {
    const nodesByState = {};
    for (const node of this.nodes.values()) {
      nodesByState[node.state] = (nodesByState[node.state] || 0) + 1;
    }

    return {
      id: this.id,
      name: this.name,
      state: this.state,
      progress: this.getProgress(),
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.completedAt 
        ? this.completedAt - this.startedAt
        : (this.startedAt ? Date.now() - this.startedAt : 0),
      nodes: {
        total: this.nodes.size,
        byState: nodesByState,
      },
      activeNodes: Array.from(this.activeNodes),
      metrics: { ...this.metrics },
    };
  }

  // ── Metrics & Logging ───────────────────────────────────────────────────────

  /**
   * Log an event.
   * @private
   * @param {string} type
   * @param {string} detail
   */
  _log(type, detail) {
    const entry = {
      type,
      detail,
      timestamp: Date.now(),
      flowState: this.state,
      pulseCount: this.metrics.pulseCount,
    };
    this.eventLog.push(entry);

    // Keep log bounded
    if (this.eventLog.length > 5000) {
      this.eventLog = this.eventLog.slice(-2500);
    }
  }

  /**
   * Get recent log entries.
   * @param {number} [count=50]
   * @returns {Object[]}
   */
  getRecentLogs(count = 50) {
    return this.eventLog.slice(-count);
  }

  /**
   * Get metrics snapshot.
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      state: this.state,
      progress: this.getProgress(),
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
    };
  }

  // ── Serialization ───────────────────────────────────────────────────────────

  /**
   * Serialize the flow state for persistence.
   * @returns {Object}
   */
  serialize() {
    const nodes = [];
    for (const [id, node] of this.nodes) {
      nodes.push({
        id,
        type: node.type,
        name: node.name,
        state: node.state,
        dependencies: node.dependencies,
        context: node.context,
        startedAt: node.startedAt,
        completedAt: node.completedAt,
        retryCount: node.retryCount,
        maxRetries: node.maxRetries,
        result: node.result,
        error: node.error,
      });
    }

    const edges = {};
    for (const [from, to] of this.edges) {
      edges[from] = to;
    }

    return {
      id: this.id,
      name: this.name,
      state: this.state,
      nodes,
      edges,
      entryNode: this.entryNode,
      exitNodes: Array.from(this.exitNodes),
      activeNodes: Array.from(this.activeNodes),
      completedNodes: Array.from(this.completedNodes),
      context: this.context,
      metrics: this.metrics,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      eventLog: this.eventLog.slice(-100),
    };
  }

  /**
   * Restore flow state from serialized data.
   * @param {Object} data
   * @returns {{ success: boolean }}
   */
  deserialize(data) {
    try {
      this.id = data.id;
      this.name = data.name;
      this.state = data.state;
      this.entryNode = data.entryNode;
      this.context = data.context || {};
      this.metrics = data.metrics || this.metrics;
      this.startedAt = data.startedAt;
      this.completedAt = data.completedAt;
      this.eventLog = data.eventLog || [];

      this.exitNodes = new Set(data.exitNodes || []);
      this.activeNodes = new Set(data.activeNodes || []);
      this.completedNodes = new Set(data.completedNodes || []);

      this.nodes.clear();
      for (const nodeDef of (data.nodes || [])) {
        const node = this._createNode(nodeDef);
        node.state = nodeDef.state || 'pending';
        node.startedAt = nodeDef.startedAt || 0;
        node.completedAt = nodeDef.completedAt || 0;
        node.retryCount = nodeDef.retryCount || 0;
        node.result = nodeDef.result;
        node.error = nodeDef.error;
        this.nodes.set(node.id, node);
      }

      this.edges.clear();
      for (const [from, to] of Object.entries(data.edges || {})) {
        this.edges.set(from, Array.isArray(to) ? to : [to]);
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  FlowStateMachine,
  STATE_TRANSITIONS,
  PHI,
  PHI_INV,
  HEARTBEAT_MS,
};
