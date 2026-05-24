/**
 * PROTO-228: Edge AI Intelligence Protocol (EAIP)
 *
 * Governs the distributed AI intelligence network across all edge locations.
 * Each edge runs a named AI engine with autonomous capabilities bounded by
 * the Sovereign Charter and MEGA LAWS.
 *
 * This protocol defines:
 *   1. Edge AI engine registration and identity
 *   2. Inter-edge communication and routing
 *   3. Federated learning participation
 *   4. Health monitoring and failover
 *   5. Defensive mode activation
 *   6. Phi-weighted request routing
 *
 * @module protocols/edge-ai-intelligence-protocol
 * @version 1.0.0
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT = 873;

// ── Edge AI Engine Identities ─────────────────────────────────────────────────

const EDGE_AI_ENGINES = {
  // North America
  'EDGE-DFW-AI': {
    name: 'DALLAS COGNITOR',
    region: 'DFW',
    location: 'Dallas/Fort Worth, Texas, USA',
    symbol: '🤠',
    specialty: 'Central US Intelligence Routing',
    languages: ['en'],
    tier: 'primary',
  },
  'EDGE-LAX-AI': {
    name: 'PACIFIC ORACLE',
    region: 'LAX',
    location: 'Los Angeles, California, USA',
    symbol: '🌊',
    specialty: 'West Coast Inference Engine',
    languages: ['en', 'es'],
    tier: 'primary',
  },
  'EDGE-SEA-AI': {
    name: 'CASCADIA MIND',
    region: 'SEA',
    location: 'Seattle, Washington, USA',
    symbol: '🌲',
    specialty: 'Pacific Northwest Reasoning',
    languages: ['en'],
    tier: 'secondary',
  },
  'EDGE-ORD-AI': {
    name: 'MIDWEST CORTEX',
    region: 'ORD',
    location: 'Chicago, Illinois, USA',
    symbol: '🏙️',
    specialty: 'Great Lakes Intelligence Hub',
    languages: ['en'],
    tier: 'primary',
  },
  'EDGE-EWR-AI': {
    name: 'ATLANTIC SAGE',
    region: 'EWR',
    location: 'Newark, New Jersey, USA',
    symbol: '🗽',
    specialty: 'East Coast Cognitive Gateway',
    languages: ['en'],
    tier: 'primary',
  },
  'EDGE-MIA-AI': {
    name: 'CARIBBEAN SYNAPSE',
    region: 'MIA',
    location: 'Miami, Florida, USA',
    symbol: '🌴',
    specialty: 'Southeast US Neural Bridge',
    languages: ['en', 'es'],
    tier: 'secondary',
  },

  // Europe
  'EDGE-LHR-AI': {
    name: 'BRITANNIA ENGINE',
    region: 'LHR',
    location: 'London, United Kingdom',
    symbol: '🎩',
    specialty: 'European Intelligence Gateway',
    languages: ['en'],
    tier: 'primary',
  },
  'EDGE-FRA-AI': {
    name: 'FRANKFURT NEXUS',
    region: 'FRA',
    location: 'Frankfurt, Germany',
    symbol: '🏛️',
    specialty: 'EU Central Processing Mind',
    languages: ['de', 'en'],
    tier: 'primary',
  },

  // Asia-Pacific
  'EDGE-NRT-AI': {
    name: 'TOKYO RESONANCE',
    region: 'NRT',
    location: 'Tokyo, Japan',
    symbol: '⛩️',
    specialty: 'Asia-Pacific Cognitive Core',
    languages: ['ja', 'en'],
    tier: 'primary',
  },
  'EDGE-SIN-AI': {
    name: 'SINGAPORE MATRIX',
    region: 'SIN',
    location: 'Singapore',
    symbol: '🦁',
    specialty: 'Southeast Asian Intelligence',
    languages: ['en', 'zh', 'ms', 'ta'],
    tier: 'primary',
  },
  'EDGE-SYD-AI': {
    name: 'OCEANIA PULSE',
    region: 'SYD',
    location: 'Sydney, Australia',
    symbol: '🦘',
    specialty: 'Australian Reasoning Engine',
    languages: ['en'],
    tier: 'secondary',
  },

  // Latin America
  'EDGE-GRU-AI': {
    name: 'SAO PAULO AXIOM',
    region: 'GRU',
    location: 'São Paulo, Brazil',
    symbol: '🎭',
    specialty: 'Latin American Intelligence',
    languages: ['pt', 'es', 'en'],
    tier: 'primary',
  },
};

// ── Edge AI States ────────────────────────────────────────────────────────────

const EDGE_AI_STATES = {
  INITIALIZING: 'initializing',
  ACTIVE: 'active',
  DEGRADED: 'degraded',
  DEFENSIVE: 'defensive',
  OFFLINE: 'offline',
  DRAINING: 'draining',
};

// ── Core AI Engine Identities ─────────────────────────────────────────────────

const CORE_AI_ENGINES = {
  'ENG-001': { name: 'CHRONOS', domain: 'Time', symbol: '🕐' },
  'ENG-002': { name: 'NEXORIS', domain: 'State', symbol: '🔮' },
  'ENG-003': { name: 'QUANTUM', domain: 'Entropy', symbol: '🎲' },
  'ENG-004': { name: 'COREOGRAPH', domain: 'Messaging', symbol: '📡' },
  'ENG-005': { name: 'SOLUS', domain: 'Cognition', symbol: '🧠' },
  'ENG-006': { name: 'SENTINEL', domain: 'Security', symbol: '🛡️' },
  'ENG-007': { name: 'CARTOGRAPHER', domain: 'Knowledge', symbol: '🗺️' },
};

// ── Edge AI Instance ──────────────────────────────────────────────────────────

class EdgeAIEngine {
  /**
   * @param {string} edgeId - Edge AI identifier (e.g., 'EDGE-DFW-AI')
   * @param {object} config - Configuration options
   */
  constructor(edgeId, config = {}) {
    const definition = EDGE_AI_ENGINES[edgeId];
    if (!definition) {
      throw new Error(`Unknown Edge AI: ${edgeId}`);
    }

    this.id = edgeId;
    this.name = definition.name;
    this.region = definition.region;
    this.location = definition.location;
    this.symbol = definition.symbol;
    this.specialty = definition.specialty;
    this.languages = definition.languages;
    this.tier = definition.tier;

    this.state = EDGE_AI_STATES.INITIALIZING;
    this.health = 100;
    this.lastHeartbeat = null;
    this.heartbeatDrift = 0;

    // Metrics
    this.metrics = {
      requests: 0,
      errors: 0,
      avgLatencyMs: 0,
      p99LatencyMs: 0,
      cacheHitRate: 0,
      federatedUpdates: 0,
    };

    // Local microbot registry
    this.microbots = new Map();

    // Federated learning state
    this.localModelUpdates = [];
    this.lastAggregation = null;

    // Configuration
    this._heartbeatSyncTolerance = config.heartbeatSyncTolerance || 50;
    this._healthReportInterval = config.healthReportInterval || 10;
    this._failoverThreshold = config.failoverThreshold || 2;
    this._onHealthReport = config.onHealthReport || null;
    this._onStateChange = config.onStateChange || null;

    this._latencySamples = [];
    this._heartbeatCount = 0;
  }

  /**
   * Initialize the Edge AI Engine
   */
  async initialize() {
    this.state = EDGE_AI_STATES.ACTIVE;
    this.lastHeartbeat = Date.now();

    if (this._onStateChange) {
      this._onStateChange(this.state, this.id);
    }

    return {
      id: this.id,
      name: this.name,
      state: this.state,
      location: this.location,
    };
  }

  /**
   * Process heartbeat from central CHRONOS
   * @param {number} centralTime - Central heartbeat timestamp
   */
  processHeartbeat(centralTime) {
    const now = Date.now();
    this.heartbeatDrift = Math.abs(now - centralTime);
    this.lastHeartbeat = now;
    this._heartbeatCount++;

    // Check sync tolerance (EL-004: Law of Edge AI Heartbeat Sync)
    if (this.heartbeatDrift > this._heartbeatSyncTolerance) {
      console.warn(
        `${this.symbol} ${this.name}: Heartbeat drift ${this.heartbeatDrift}ms exceeds tolerance`
      );
      this._degradeHealth(5);
    }

    // Report health every N heartbeats (EL-006)
    if (this._heartbeatCount % this._healthReportInterval === 0) {
      this._reportHealth();
    }

    return {
      edgeId: this.id,
      drift: this.heartbeatDrift,
      health: this.health,
    };
  }

  /**
   * Process an incoming request
   * @param {object} request - Request to process
   */
  async processRequest(request) {
    const startTime = Date.now();
    this.metrics.requests++;

    try {
      // Simulate processing
      const result = await this._handleRequest(request);

      const latency = Date.now() - startTime;
      this._recordLatency(latency);

      return {
        success: true,
        edgeId: this.id,
        edgeName: this.name,
        result,
        latencyMs: latency,
      };
    } catch (error) {
      this.metrics.errors++;
      this._degradeHealth(2);

      return {
        success: false,
        edgeId: this.id,
        error: error.message,
      };
    }
  }

  /**
   * Internal request handler
   * @private
   */
  async _handleRequest(request) {
    // Edge-specific processing based on specialty
    const processed = {
      edgeId: this.id,
      specialty: this.specialty,
      processedAt: new Date().toISOString(),
      requestType: request.type || 'generic',
    };

    return processed;
  }

  /**
   * Record latency sample for metrics
   * @private
   */
  _recordLatency(latencyMs) {
    this._latencySamples.push(latencyMs);

    // Keep last 1000 samples
    if (this._latencySamples.length > 1000) {
      this._latencySamples.shift();
    }

    // Update metrics
    const sum = this._latencySamples.reduce((a, b) => a + b, 0);
    this.metrics.avgLatencyMs = sum / this._latencySamples.length;

    // Calculate P99
    const sorted = [...this._latencySamples].sort((a, b) => a - b);
    const p99Index = Math.floor(sorted.length * 0.99);
    this.metrics.p99LatencyMs = sorted[p99Index] || 0;
  }

  /**
   * Degrade health score
   * @private
   */
  _degradeHealth(amount) {
    this.health = Math.max(0, this.health - amount);

    if (this.health < 50 && this.state === EDGE_AI_STATES.ACTIVE) {
      this.state = EDGE_AI_STATES.DEGRADED;
      if (this._onStateChange) {
        this._onStateChange(this.state, this.id);
      }
    }

    if (this.health === 0 && this.state !== EDGE_AI_STATES.OFFLINE) {
      this.state = EDGE_AI_STATES.OFFLINE;
      if (this._onStateChange) {
        this._onStateChange(this.state, this.id);
      }
    }
  }

  /**
   * Report health metrics (EL-006)
   * @private
   */
  _reportHealth() {
    const report = {
      edgeId: this.id,
      name: this.name,
      state: this.state,
      health: this.health,
      heartbeatDrift: this.heartbeatDrift,
      metrics: { ...this.metrics },
      timestamp: new Date().toISOString(),
    };

    if (this._onHealthReport) {
      this._onHealthReport(report);
    }

    return report;
  }

  /**
   * Enter defensive mode (SL-009, EL-009)
   */
  enterDefensiveMode(reason) {
    if (this.state === EDGE_AI_STATES.DEFENSIVE) return;

    this.state = EDGE_AI_STATES.DEFENSIVE;
    console.warn(`${this.symbol} ${this.name}: DEFENSIVE MODE - ${reason}`);

    if (this._onStateChange) {
      this._onStateChange(this.state, this.id, { reason });
    }

    return {
      edgeId: this.id,
      state: this.state,
      reason,
      activatedAt: new Date().toISOString(),
    };
  }

  /**
   * Exit defensive mode
   */
  exitDefensiveMode() {
    if (this.state !== EDGE_AI_STATES.DEFENSIVE) return;

    this.state = this.health >= 50 ? EDGE_AI_STATES.ACTIVE : EDGE_AI_STATES.DEGRADED;

    if (this._onStateChange) {
      this._onStateChange(this.state, this.id);
    }

    return { edgeId: this.id, state: this.state };
  }

  /**
   * Spawn a local microbot (EL-007)
   * @param {string} name - Microbot name
   * @param {string} task - Task description
   */
  spawnMicrobot(name, task) {
    const microbotId = `${this.id}-mb-${Date.now().toString(36)}`;
    const microbot = {
      id: microbotId,
      name,
      task,
      parentEdge: this.id,
      state: 'running',
      spawnedAt: new Date().toISOString(),
    };

    this.microbots.set(microbotId, microbot);

    return microbot;
  }

  /**
   * Complete a microbot task
   */
  completeMicrobot(microbotId, result) {
    const microbot = this.microbots.get(microbotId);
    if (!microbot) return null;

    microbot.state = 'complete';
    microbot.result = result;
    microbot.completedAt = new Date().toISOString();

    return microbot;
  }

  /**
   * Record federated learning update
   * @param {object} update - Local model update
   */
  recordFederatedUpdate(update) {
    this.localModelUpdates.push({
      ...update,
      edgeId: this.id,
      timestamp: Date.now(),
    });

    this.metrics.federatedUpdates++;

    // Keep last 100 updates
    if (this.localModelUpdates.length > 100) {
      this.localModelUpdates.shift();
    }
  }

  /**
   * Get updates for central aggregation
   */
  getUpdatesForAggregation() {
    const updates = [...this.localModelUpdates];
    this.localModelUpdates = [];
    this.lastAggregation = Date.now();
    return updates;
  }

  /**
   * Get edge status summary
   */
  getStatus() {
    return {
      id: this.id,
      name: this.name,
      symbol: this.symbol,
      region: this.region,
      location: this.location,
      specialty: this.specialty,
      state: this.state,
      health: this.health,
      heartbeatDrift: this.heartbeatDrift,
      metrics: { ...this.metrics },
      microbots: this.microbots.size,
      federatedUpdates: this.localModelUpdates.length,
    };
  }
}

// ── Edge AI Mesh (Orchestrator) ───────────────────────────────────────────────

class EdgeAIMesh {
  constructor(config = {}) {
    this.edges = new Map();
    this.centralHeartbeat = null;
    this._heartbeatInterval = config.heartbeatInterval || HEARTBEAT;
    this._onEdgeStateChange = config.onEdgeStateChange || null;
    this._onHealthReport = config.onHealthReport || null;
  }

  /**
   * Register an Edge AI Engine
   */
  registerEdge(edgeId, edgeConfig = {}) {
    const edge = new EdgeAIEngine(edgeId, {
      ...edgeConfig,
      onStateChange: (state, id, meta) => {
        if (this._onEdgeStateChange) {
          this._onEdgeStateChange(state, id, meta);
        }
      },
      onHealthReport: (report) => {
        if (this._onHealthReport) {
          this._onHealthReport(report);
        }
      },
    });

    this.edges.set(edgeId, edge);
    return edge;
  }

  /**
   * Initialize all edges
   */
  async initializeAll() {
    const results = [];
    for (const [edgeId, edge] of this.edges) {
      const result = await edge.initialize();
      results.push(result);
    }
    return results;
  }

  /**
   * Broadcast heartbeat to all edges
   */
  broadcastHeartbeat() {
    const centralTime = Date.now();
    this.centralHeartbeat = centralTime;

    const results = [];
    for (const [edgeId, edge] of this.edges) {
      if (edge.state !== EDGE_AI_STATES.OFFLINE) {
        results.push(edge.processHeartbeat(centralTime));
      }
    }

    return { centralTime, edgeResponses: results };
  }

  /**
   * Route request to best edge using phi-weighted scoring
   * @param {object} request - Request to route
   * @param {string} preferredRegion - Optional preferred region
   */
  routeRequest(request, preferredRegion = null) {
    const activeEdges = [...this.edges.values()].filter(
      (e) => e.state === EDGE_AI_STATES.ACTIVE || e.state === EDGE_AI_STATES.DEGRADED
    );

    if (activeEdges.length === 0) {
      throw new Error('No active Edge AI engines available');
    }

    // Phi-weighted scoring
    const scored = activeEdges.map((edge) => {
      const latencyScore = edge.metrics.avgLatencyMs > 0 ? 1 / edge.metrics.avgLatencyMs : 1;
      const healthScore = edge.health / 100;
      const regionBonus = preferredRegion && edge.region === preferredRegion ? PHI : 1;

      const score = latencyScore * healthScore * PHI * regionBonus;

      return { edge, score };
    });

    // Select best edge
    scored.sort((a, b) => b.score - a.score);
    const bestEdge = scored[0].edge;

    return bestEdge;
  }

  /**
   * Trigger failover from one edge to another (EL-009)
   */
  triggerFailover(failedEdgeId) {
    const failedEdge = this.edges.get(failedEdgeId);
    if (!failedEdge) return null;

    // Find nearest healthy edge
    const healthyEdges = [...this.edges.values()].filter(
      (e) => e.id !== failedEdgeId && e.state === EDGE_AI_STATES.ACTIVE && e.health >= 50
    );

    if (healthyEdges.length === 0) {
      console.error('CRITICAL: No healthy edges available for failover');
      return null;
    }

    // Sort by health score
    healthyEdges.sort((a, b) => b.health - a.health);
    const targetEdge = healthyEdges[0];

    console.log(
      `Failover: ${failedEdge.name} → ${targetEdge.name}`
    );

    return {
      failedEdge: failedEdgeId,
      targetEdge: targetEdge.id,
      targetName: targetEdge.name,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get mesh status
   */
  getStatus() {
    const edgeStatuses = [...this.edges.values()].map((e) => e.getStatus());
    const activeCount = edgeStatuses.filter(
      (e) => e.state === EDGE_AI_STATES.ACTIVE
    ).length;
    const degradedCount = edgeStatuses.filter(
      (e) => e.state === EDGE_AI_STATES.DEGRADED
    ).length;
    const offlineCount = edgeStatuses.filter(
      (e) => e.state === EDGE_AI_STATES.OFFLINE
    ).length;

    return {
      totalEdges: this.edges.size,
      activeEdges: activeCount,
      degradedEdges: degradedCount,
      offlineEdges: offlineCount,
      centralHeartbeat: this.centralHeartbeat,
      edges: edgeStatuses,
    };
  }

  /**
   * Aggregate federated learning updates from all edges
   */
  aggregateFederatedUpdates() {
    const allUpdates = [];
    for (const [edgeId, edge] of this.edges) {
      const updates = edge.getUpdatesForAggregation();
      allUpdates.push(...updates);
    }

    return {
      totalUpdates: allUpdates.length,
      updates: allUpdates,
      aggregatedAt: new Date().toISOString(),
    };
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  EDGE_AI_ENGINES,
  EDGE_AI_STATES,
  CORE_AI_ENGINES,
  EdgeAIEngine,
  EdgeAIMesh,
  PHI,
  PHI_INV,
  HEARTBEAT,
};
