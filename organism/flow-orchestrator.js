/**
 * 🔄 FLOW ORCHESTRATOR — Multi-Flow Coordination Engine
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Coordinates multiple FlowStateMachine instances for complex workflows.
 * Provides:
 *   - Parallel flow execution with dependencies
 *   - Agent health integration
 *   - Divergence tracking integration
 *   - Evolution cycle management
 *   - Unified heartbeat loop
 *
 * Wires into:
 *   - AUTO Orchestrator (replaces basic task processing)
 *   - Divergence Tracker (metrics push)
 *   - Evolution Engine (fitness evaluation)
 *   - Agent Registry (health monitoring)
 *
 * id: atlas://organism/flow-orchestrator
 * class: T1-SOVEREIGN
 */

'use strict';

const { FlowStateMachine, PHI, PHI_INV, HEARTBEAT_MS } = require('./flow-state-machine');

// ── Flow Orchestrator Class ───────────────────────────────────────────────────

class FlowOrchestrator {
  /**
   * @param {Object} config - Configuration
   * @param {string} [config.id] - Orchestrator ID
   * @param {number} [config.heartbeatMs] - Heartbeat interval
   * @param {number} [config.maxConcurrentFlows=3] - Max concurrent flows
   * @param {Function} [config.onFlowComplete] - Callback when a flow completes
   * @param {Function} [config.onFlowError] - Callback when a flow errors
   * @param {Function} [config.onHeartbeat] - Callback on each heartbeat
   */
  constructor(config = {}) {
    this.id = config.id || `orchestrator-${Date.now()}`;
    this.heartbeatMs = config.heartbeatMs || HEARTBEAT_MS;
    this.maxConcurrentFlows = config.maxConcurrentFlows || 3;

    this.onFlowComplete = config.onFlowComplete || null;
    this.onFlowError = config.onFlowError || null;
    this.onHeartbeat = config.onHeartbeat || null;

    /** @type {'stopped'|'running'|'paused'} */
    this.state = 'stopped';

    /** @type {Map<string, FlowStateMachine>} */
    this.flows = new Map();

    /** @type {Map<string, string[]>} */
    this.flowDependencies = new Map();

    /** @type {string[]} */
    this.flowQueue = [];

    /** @type {Set<string>} */
    this.activeFlows = new Set();

    /** @type {Set<string>} */
    this.completedFlows = new Set();

    /** @type {Object} */
    this.agents = {};

    /** @type {Object[]} */
    this.eventLog = [];

    /** @type {Object} */
    this.metrics = {
      heartbeatCount: 0,
      flowsQueued: 0,
      flowsStarted: 0,
      flowsCompleted: 0,
      flowsFailed: 0,
      totalNodesExecuted: 0,
      avgFlowDuration: 0,
      healthScore: 1.0,
      phiResonance: PHI_INV,
      lastHeartbeat: null,
    };

    this.heartbeatTimer = null;
    this.startedAt = null;
  }

  // ── Flow Management ─────────────────────────────────────────────────────────

  /**
   * Register a flow with the orchestrator.
   * @param {string} flowId - Unique flow identifier
   * @param {Object} flowDefinition - Flow definition
   * @param {string[]} [dependencies] - IDs of flows that must complete first
   * @returns {{ success: boolean, flowId: string }}
   */
  registerFlow(flowId, flowDefinition, dependencies = []) {
    const fsm = new FlowStateMachine({
      id: flowId,
      name: flowDefinition.name || flowId,
    });

    fsm.loadFlow(flowDefinition);
    this.flows.set(flowId, fsm);
    this.flowDependencies.set(flowId, dependencies);

    this._log('flow-registered', `Registered flow: ${flowId}`);
    return { success: true, flowId };
  }

  /**
   * Queue a flow for execution.
   * @param {string} flowId - Flow ID to queue
   * @param {Object} [context] - Context to merge into flow
   * @returns {{ success: boolean, position: number }}
   */
  queueFlow(flowId, context = {}) {
    const fsm = this.flows.get(flowId);
    if (!fsm) {
      return { success: false, error: `Flow not found: ${flowId}` };
    }

    // Merge context
    fsm.context = { ...fsm.context, ...context };

    if (!this.flowQueue.includes(flowId)) {
      this.flowQueue.push(flowId);
      this.metrics.flowsQueued++;
    }

    this._log('flow-queued', `Queued flow: ${flowId}`);
    return { success: true, position: this.flowQueue.indexOf(flowId) };
  }

  /**
   * Check if a flow's dependencies are satisfied.
   * @private
   * @param {string} flowId
   * @returns {boolean}
   */
  _areDependenciesSatisfied(flowId) {
    const deps = this.flowDependencies.get(flowId) || [];
    return deps.every(depId => this.completedFlows.has(depId));
  }

  // ── Heartbeat Loop ──────────────────────────────────────────────────────────

  /**
   * Start the orchestrator heartbeat loop.
   * @returns {{ success: boolean }}
   */
  start() {
    if (this.state === 'running') {
      return { success: false, error: 'Already running' };
    }

    this.state = 'running';
    this.startedAt = Date.now();
    this.metrics.lastHeartbeat = Date.now();

    this._log('orchestrator-started', `Heartbeat: ${this.heartbeatMs}ms`);

    // Start heartbeat loop
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatMs);

    return { success: true };
  }

  /**
   * Stop the orchestrator.
   * @returns {{ success: boolean }}
   */
  stop() {
    if (this.state === 'stopped') {
      return { success: false, error: 'Already stopped' };
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.state = 'stopped';
    this._log('orchestrator-stopped', `Uptime: ${Date.now() - this.startedAt}ms`);

    return { success: true };
  }

  /**
   * Pause the orchestrator.
   * @returns {{ success: boolean }}
   */
  pause() {
    if (this.state !== 'running') {
      return { success: false, error: 'Not running' };
    }

    this.state = 'paused';
    this._log('orchestrator-paused', 'Heartbeat paused');
    return { success: true };
  }

  /**
   * Resume the orchestrator.
   * @returns {{ success: boolean }}
   */
  resume() {
    if (this.state !== 'paused') {
      return { success: false, error: 'Not paused' };
    }

    this.state = 'running';
    this._log('orchestrator-resumed', 'Heartbeat resumed');
    return { success: true };
  }

  /**
   * Execute one heartbeat pulse.
   * This is the main coordination driver.
   * @returns {Object} - Heartbeat result
   */
  heartbeat() {
    if (this.state !== 'running') {
      return { processed: false, reason: 'not-running' };
    }

    const heartbeatStart = Date.now();
    this.metrics.heartbeatCount++;
    this.metrics.lastHeartbeat = heartbeatStart;

    const result = {
      heartbeat: this.metrics.heartbeatCount,
      timestamp: heartbeatStart,
      flowsProcessed: 0,
      nodesProcessed: 0,
      activeFlows: 0,
      queuedFlows: this.flowQueue.length,
    };

    // 1. Start queued flows that have satisfied dependencies
    this._processFlowQueue();

    // 2. Pulse all active flows
    for (const flowId of this.activeFlows) {
      const fsm = this.flows.get(flowId);
      if (!fsm) continue;

      const pulseResult = fsm.pulse();
      result.nodesProcessed += pulseResult.processed || 0;
      result.flowsProcessed++;

      // Check for flow completion
      if (fsm.state === 'completed') {
        this._onFlowComplete(flowId, fsm);
      } else if (fsm.state === 'failed') {
        this._onFlowError(flowId, fsm);
      }
    }

    result.activeFlows = this.activeFlows.size;

    // 3. Update health metrics with phi-decay
    this._updateHealthMetrics(heartbeatStart);

    // 4. Call heartbeat callback
    if (this.onHeartbeat) {
      try {
        this.onHeartbeat(result);
      } catch (e) {
        this._log('callback-error', `onHeartbeat error: ${e.message}`);
      }
    }

    this.metrics.totalNodesExecuted += result.nodesProcessed;

    return result;
  }

  /**
   * Process the flow queue - start flows that are ready.
   * @private
   */
  _processFlowQueue() {
    // Find flows ready to start
    const readyFlows = this.flowQueue.filter(flowId => {
      // Check dependencies
      if (!this._areDependenciesSatisfied(flowId)) return false;

      // Check concurrent limit
      if (this.activeFlows.size >= this.maxConcurrentFlows) return false;

      return true;
    });

    // Start ready flows
    for (const flowId of readyFlows) {
      const fsm = this.flows.get(flowId);
      if (!fsm) continue;

      // Remove from queue
      const idx = this.flowQueue.indexOf(flowId);
      if (idx > -1) this.flowQueue.splice(idx, 1);

      // Start the flow
      const startResult = fsm.start();
      if (startResult.success) {
        this.activeFlows.add(flowId);
        this.metrics.flowsStarted++;
        this._log('flow-started', `Started flow: ${flowId}`);
      } else {
        this._log('flow-start-error', `Failed to start flow ${flowId}: ${startResult.error}`);
      }
    }
  }

  /**
   * Handle flow completion.
   * @private
   * @param {string} flowId
   * @param {FlowStateMachine} fsm
   */
  _onFlowComplete(flowId, fsm) {
    this.activeFlows.delete(flowId);
    this.completedFlows.add(flowId);
    this.metrics.flowsCompleted++;

    // Update average duration
    const duration = fsm.completedAt - fsm.startedAt;
    this.metrics.avgFlowDuration = 
      this.metrics.avgFlowDuration * PHI_INV + duration * (1 - PHI_INV);

    this._log('flow-completed', `Flow ${flowId} completed in ${duration}ms`);

    if (this.onFlowComplete) {
      try {
        this.onFlowComplete(flowId, fsm.getStatus());
      } catch (e) {
        this._log('callback-error', `onFlowComplete error: ${e.message}`);
      }
    }
  }

  /**
   * Handle flow error.
   * @private
   * @param {string} flowId
   * @param {FlowStateMachine} fsm
   */
  _onFlowError(flowId, fsm) {
    this.activeFlows.delete(flowId);
    this.metrics.flowsFailed++;

    this._log('flow-failed', `Flow ${flowId} failed`);

    if (this.onFlowError) {
      try {
        this.onFlowError(flowId, fsm.getStatus());
      } catch (e) {
        this._log('callback-error', `onFlowError error: ${e.message}`);
      }
    }
  }

  /**
   * Update health metrics with phi-smoothing.
   * @private
   * @param {number} heartbeatStart
   */
  _updateHealthMetrics(heartbeatStart) {
    const duration = Date.now() - heartbeatStart;
    const targetDuration = this.heartbeatMs * 0.5; // Target 50% utilization

    // Health degrades if heartbeat takes too long
    const utilization = duration / this.heartbeatMs;
    const healthDelta = utilization < 0.8 ? 0.01 : -0.02 * utilization;

    this.metrics.healthScore = Math.max(0, Math.min(1,
      this.metrics.healthScore * (1 - PHI_INV * 0.1) + (1 + healthDelta) * PHI_INV * 0.1
    ));

    // Update phi resonance
    this.metrics.phiResonance = 
      this.metrics.phiResonance * PHI_INV + (duration / HEARTBEAT_MS) * (1 - PHI_INV);
  }

  // ── Agent Health Integration ────────────────────────────────────────────────

  /**
   * Register an agent for health monitoring.
   * @param {string} agentId
   * @param {Object} agentData
   */
  registerAgent(agentId, agentData) {
    this.agents[agentId] = {
      ...agentData,
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'active',
    };
    this._log('agent-registered', `Agent registered: ${agentId}`);
  }

  /**
   * Update agent health status.
   * @param {string} agentId
   * @param {Object} healthData
   */
  updateAgentHealth(agentId, healthData) {
    if (this.agents[agentId]) {
      this.agents[agentId] = {
        ...this.agents[agentId],
        ...healthData,
        lastSeen: Date.now(),
      };
    }
  }

  /**
   * Check all agents and update their status.
   * @returns {Object[]} - Agent health statuses
   */
  checkAgentHealth() {
    const now = Date.now();
    const results = [];

    for (const [agentId, agent] of Object.entries(this.agents)) {
      // Mark as stale if not seen for 3 heartbeats
      const staleThreshold = this.heartbeatMs * 3;
      if (now - agent.lastSeen > staleThreshold) {
        agent.status = 'stale';
      }

      results.push({
        id: agentId,
        status: agent.status,
        lastSeen: agent.lastSeen,
        age: now - agent.registeredAt,
      });
    }

    return results;
  }

  // ── Querying ────────────────────────────────────────────────────────────────

  /**
   * Get the status of a specific flow.
   * @param {string} flowId
   * @returns {Object|null}
   */
  getFlowStatus(flowId) {
    const fsm = this.flows.get(flowId);
    if (!fsm) return null;
    return fsm.getStatus();
  }

  /**
   * Get overall orchestrator status.
   * @returns {Object}
   */
  getStatus() {
    const flowStatuses = [];
    for (const [flowId, fsm] of this.flows) {
      flowStatuses.push({
        id: flowId,
        state: fsm.state,
        progress: fsm.getProgress(),
        isActive: this.activeFlows.has(flowId),
        isQueued: this.flowQueue.includes(flowId),
        isComplete: this.completedFlows.has(flowId),
      });
    }

    return {
      id: this.id,
      state: this.state,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      heartbeat: {
        interval: this.heartbeatMs,
        count: this.metrics.heartbeatCount,
        lastAt: this.metrics.lastHeartbeat,
      },
      flows: {
        total: this.flows.size,
        active: this.activeFlows.size,
        queued: this.flowQueue.length,
        completed: this.completedFlows.size,
        statuses: flowStatuses,
      },
      agents: {
        total: Object.keys(this.agents).length,
        statuses: this.checkAgentHealth(),
      },
      metrics: { ...this.metrics },
    };
  }

  /**
   * Get combined metrics from all flows.
   * @returns {Object}
   */
  getAggregateMetrics() {
    let totalNodes = 0;
    let completedNodes = 0;
    let failedNodes = 0;

    for (const fsm of this.flows.values()) {
      const fsmMetrics = fsm.getMetrics();
      totalNodes += fsm.nodes.size;
      completedNodes += fsmMetrics.totalNodesSucceeded;
      failedNodes += fsmMetrics.totalNodesFailed;
    }

    return {
      ...this.metrics,
      totalNodes,
      completedNodes,
      failedNodes,
      successRate: totalNodes > 0 
        ? Math.round((completedNodes / totalNodes) * 100) 
        : 0,
    };
  }

  // ── Logging ─────────────────────────────────────────────────────────────────

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
      orchestratorState: this.state,
      heartbeat: this.metrics.heartbeatCount,
    };
    this.eventLog.push(entry);

    // Keep bounded
    if (this.eventLog.length > 5000) {
      this.eventLog = this.eventLog.slice(-2500);
    }
  }

  /**
   * Get recent events.
   * @param {number} [count=50]
   * @returns {Object[]}
   */
  getRecentEvents(count = 50) {
    return this.eventLog.slice(-count);
  }

  // ── Serialization ───────────────────────────────────────────────────────────

  /**
   * Serialize orchestrator state.
   * @returns {Object}
   */
  serialize() {
    const flows = {};
    for (const [flowId, fsm] of this.flows) {
      flows[flowId] = fsm.serialize();
    }

    const dependencies = {};
    for (const [flowId, deps] of this.flowDependencies) {
      dependencies[flowId] = deps;
    }

    return {
      id: this.id,
      state: this.state,
      flows,
      dependencies,
      flowQueue: [...this.flowQueue],
      activeFlows: Array.from(this.activeFlows),
      completedFlows: Array.from(this.completedFlows),
      agents: { ...this.agents },
      metrics: { ...this.metrics },
      startedAt: this.startedAt,
      eventLog: this.eventLog.slice(-100),
    };
  }

  /**
   * Restore orchestrator state.
   * @param {Object} data
   * @returns {{ success: boolean }}
   */
  deserialize(data) {
    try {
      this.id = data.id;
      this.state = 'stopped'; // Always restore to stopped
      this.flowQueue = data.flowQueue || [];
      this.activeFlows = new Set(data.activeFlows || []);
      this.completedFlows = new Set(data.completedFlows || []);
      this.agents = data.agents || {};
      this.metrics = data.metrics || this.metrics;
      this.startedAt = data.startedAt;
      this.eventLog = data.eventLog || [];

      // Restore flow dependencies
      this.flowDependencies.clear();
      for (const [flowId, deps] of Object.entries(data.dependencies || {})) {
        this.flowDependencies.set(flowId, deps);
      }

      // Restore flows
      this.flows.clear();
      for (const [flowId, flowData] of Object.entries(data.flows || {})) {
        const fsm = new FlowStateMachine({ id: flowId });
        fsm.deserialize(flowData);
        this.flows.set(flowId, fsm);
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// ── Pre-built Flow Templates ──────────────────────────────────────────────────

/**
 * Create the standard AUTO heartbeat flow definition.
 * @returns {Object}
 */
function createHeartbeatFlow() {
  return {
    id: 'heartbeat-flow',
    name: 'Heartbeat Loop',
    description: 'Core heartbeat flow: health check → task processing → divergence → evolution',
    nodes: [
      {
        id: 'agent-health-check',
        name: '🤖 Agent Health Check',
        type: 'task',
        dependencies: [],
        execute: (node, ctx) => {
          const agents = ctx.agents || {};
          const healthyCount = Object.values(agents).filter(a => a.status === 'active').length;
          return { success: true, healthy: healthyCount, total: Object.keys(agents).length };
        },
      },
      {
        id: 'task-queue-processing',
        name: '📋 Task Queue Processing',
        type: 'task',
        dependencies: ['agent-health-check'],
        execute: (node, ctx) => {
          const tasks = ctx.taskQueue || [];
          const processed = Math.min(tasks.length, 5); // Process up to 5 tasks
          return { success: true, processed, remaining: tasks.length - processed };
        },
      },
      {
        id: 'divergence-tracking',
        name: '📊 Divergence Tracking',
        type: 'task',
        dependencies: ['task-queue-processing'],
        execute: (node, ctx) => {
          const metrics = ctx.divergenceMetrics || {};
          return { success: true, metrics };
        },
      },
      {
        id: 'evolution-cycle',
        name: '🧬 Evolution Cycle',
        type: 'task',
        dependencies: ['divergence-tracking'],
        execute: (node, ctx) => {
          const generation = (ctx.generation || 0) + 1;
          ctx.generation = generation;
          return { success: true, generation };
        },
      },
    ],
    edges: {
      'agent-health-check': ['task-queue-processing'],
      'task-queue-processing': ['divergence-tracking'],
      'divergence-tracking': ['evolution-cycle'],
    },
    entryNode: 'agent-health-check',
    exitNodes: ['evolution-cycle'],
  };
}

/**
 * Create the divergence experiment flow.
 * @returns {Object}
 */
function createDivergenceFlow() {
  return {
    id: 'divergence-flow',
    name: 'Divergence Experiment',
    description: 'Track code divergence, protocol drift, capability expansion',
    nodes: [
      {
        id: 'code-divergence',
        name: '💻 Code Divergence Analysis',
        type: 'task',
        dependencies: [],
        execute: (node, ctx) => {
          return { 
            success: true, 
            agentCommits: ctx.agentCommits || 0,
            humanCommits: ctx.humanCommits || 0,
          };
        },
      },
      {
        id: 'protocol-drift',
        name: '📡 Protocol Drift',
        type: 'task',
        dependencies: [],
        execute: (node, ctx) => {
          return { success: true, drift: ctx.protocolDrift || 0 };
        },
      },
      {
        id: 'capability-expansion',
        name: '🔧 Capability Expansion',
        type: 'task',
        dependencies: ['code-divergence', 'protocol-drift'],
        execute: (node, ctx) => {
          return { success: true, newCapabilities: ctx.newCapabilities || 0 };
        },
      },
      {
        id: 'governance-evolution',
        name: '⚖️ Governance Evolution',
        type: 'task',
        dependencies: ['capability-expansion'],
        execute: (node, ctx) => {
          return { success: true, lawProposals: ctx.lawProposals || 0 };
        },
      },
    ],
    edges: {
      'code-divergence': ['capability-expansion'],
      'protocol-drift': ['capability-expansion'],
      'capability-expansion': ['governance-evolution'],
    },
    entryNode: 'code-divergence',
    exitNodes: ['governance-evolution'],
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  FlowOrchestrator,
  FlowStateMachine,
  createHeartbeatFlow,
  createDivergenceFlow,
  PHI,
  PHI_INV,
  HEARTBEAT_MS,
};
