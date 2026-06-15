/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  UNIFIED ORGANISM BOOTSTRAP v2.0                                              ║
 * ║  Single Call to Activate the Complete Organism                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * This is the v2.0 unified bootstrap that creates a fully-wired organism where:
 * - All engines are connected through CNS
 * - All agents communicate bidirectionally
 * - Kingdom organs are integrated as support systems
 * - Protocols form the communication mesh
 * - Organism Arms provide sensory-motor interface
 * - Intelligence systems (Spider MoE, Nova Bridge) augment ANIMUS
 * 
 * @module sdk/unified-organism
 * @version 2.0.0
 */

import { CNSOrchestrator, SIGNAL_TYPES, COMPONENT_TYPES } from '../central-nervous-system/index.js';
import { StateBus } from '../central-nervous-system/state-bus.js';
import { SignalRouter } from '../central-nervous-system/signal-router.js';

// Core systems
import { createEngines } from '../engines/index.js';
import { createAgents } from '../agents/index.js';

// Organism Arms (sensory-motor)
import { ArmRegistry, ArmExecutor, SenseActLoop, BidirectionalRelay } from '../organism-arms/src/index.js';

// Intelligence systems
import { BLACKWXDOW, JUMPER } from '../ai-kingdom/src/spider-moe-agi.js';
import { IntelligenceBridge } from '../nova-intelligence-bridge/src/index.js';

// Kingdom organs
import { PowerGrid } from '../ai-kingdom/src/power-grid.js';
import { H2OReservoir, CoolingGenerator } from '../ai-kingdom/src/index.js';
import { GateKeeper } from '../ai-kingdom/src/gate-keepers.js';
import { RoyalTreasury } from '../ai-kingdom/src/royal-treasury.js';

// Protocols
import * as Protocols from '../../protocols/index.js';

const PHI = 1.618033988749895;
const HEARTBEAT_MS = 873;

/**
 * Unified Organism configuration
 */
export const DEFAULT_CONFIG = {
  name: 'UnifiedOrganism',
  version: '2.0.0',
  
  // Core systems
  engines: {
    enabled: true,
  },
  agents: {
    enabled: true,
    autoStart: true,
  },
  
  // Intelligence augmentation
  spiderMoE: {
    enabled: true,
    blackwxdow: true,
    jumper: true,
  },
  novaBridge: {
    enabled: true,
  },
  
  // Sensory-motor
  organismArms: {
    enabled: true,
    autoStartLoop: true,
  },
  
  // Kingdom organs
  organs: {
    power: { enabled: true },
    thermal: { enabled: true },
    immune: { enabled: true },
    treasury: { enabled: true },
  },
  
  // Protocol mesh
  protocols: {
    enabled: true,
    autoRegister: true,
  },
  
  // CNS settings
  cns: {
    autoStartHeartbeat: true,
    healthCheckInterval: 10000, // 10 seconds
  },
};

/**
 * Unified Organism Class
 * 
 * This is the v2.0 organism that wires everything together through the CNS.
 */
export class UnifiedOrganism {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.version = '2.0.0';
    this.name = this.config.name;
    
    // Core CNS components
    this.cns = null;
    this.stateBus = null;
    this.signalRouter = null;
    
    // Core systems
    this.engines = null;
    this.agents = null;
    
    // Intelligence systems
    this.spiderMoE = null;
    this.novaBridge = null;
    
    // Sensory-motor
    this.armRegistry = null;
    this.armExecutor = null;
    this.senseActLoop = null;
    this.bidirectionalRelay = null;
    
    // Kingdom organs
    this.organs = {
      power: null,
      thermal: null,
      immune: null,
      treasury: null,
    };
    
    // Protocols
    this.protocolMesh = null;
    
    // Status
    this.initialized = false;
    this.active = false;
    this.bootstrapTime = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BOOTSTRAP — Initialize and Wire All Components
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Bootstrap the unified organism
   * This is the main entry point for v2.0
   */
  async bootstrap() {
    if (this.initialized) {
      console.warn('[UnifiedOrganism] Already initialized');
      return this;
    }
    
    const startTime = Date.now();
    console.log(`[UnifiedOrganism] Bootstrapping v${this.version}...`);
    
    try {
      // Phase 1: Initialize CNS infrastructure
      await this.initializeCNS();
      
      // Phase 2: Initialize core systems
      await this.initializeEngines();
      await this.initializeAgents();
      
      // Phase 3: Initialize intelligence systems
      if (this.config.spiderMoE.enabled) {
        await this.initializeSpiderMoE();
      }
      if (this.config.novaBridge.enabled) {
        await this.initializeNovaBridge();
      }
      
      // Phase 4: Initialize sensory-motor system
      if (this.config.organismArms.enabled) {
        await this.initializeOrganismArms();
      }
      
      // Phase 5: Initialize kingdom organs
      await this.initializeOrgans();
      
      // Phase 6: Initialize protocol mesh
      if (this.config.protocols.enabled) {
        await this.initializeProtocolMesh();
      }
      
      // Phase 7: Wire everything together
      await this.wireComponents();
      
      // Phase 8: Activate CNS
      this.cns.activate();
      
      this.initialized = true;
      this.bootstrapTime = Date.now() - startTime;
      
      console.log(`[UnifiedOrganism] Bootstrap complete in ${this.bootstrapTime}ms`);
      return this;
      
    } catch (err) {
      console.error('[UnifiedOrganism] Bootstrap failed:', err);
      throw err;
    }
  }

  /**
   * Activate the organism (start all systems)
   */
  async activate() {
    if (!this.initialized) {
      throw new Error('Organism not initialized. Call bootstrap() first.');
    }
    
    if (this.active) {
      console.warn('[UnifiedOrganism] Already active');
      return;
    }
    
    console.log('[UnifiedOrganism] Activating all systems...');
    
    // Start agents
    if (this.agents && this.config.agents.autoStart) {
      for (const [agentId, agent] of Object.entries(this.agents)) {
        if (agent && typeof agent.awaken === 'function') {
          agent.awaken();
          console.log(`[UnifiedOrganism] Activated agent: ${agentId}`);
        }
      }
    }
    
    // Start sense-act loop
    if (this.senseActLoop && this.config.organismArms.autoStartLoop) {
      this.senseActLoop.start();
      console.log('[UnifiedOrganism] Started sense-act loop');
    }
    
    // Start health monitoring
    if (this.config.cns.healthCheckInterval) {
      this.startHealthMonitoring();
    }
    
    this.active = true;
    console.log('[UnifiedOrganism] All systems active');
  }

  /**
   * Deactivate the organism (stop all systems gracefully)
   */
  async deactivate() {
    if (!this.active) return;
    
    console.log('[UnifiedOrganism] Deactivating all systems...');
    
    // Stop health monitoring
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = null;
    }
    
    // Stop sense-act loop
    if (this.senseActLoop) {
      this.senseActLoop.stop();
    }
    
    // Stop agents
    if (this.agents) {
      for (const [agentId, agent] of Object.entries(this.agents)) {
        if (agent && typeof agent.shutdown === 'function') {
          agent.shutdown();
        }
      }
    }
    
    // Deactivate CNS
    if (this.cns) {
      this.cns.deactivate();
    }
    
    this.active = false;
    console.log('[UnifiedOrganism] All systems deactivated');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INITIALIZATION PHASES
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Phase 1: Initialize CNS infrastructure
   */
  async initializeCNS() {
    console.log('[UnifiedOrganism] Phase 1: Initializing CNS...');
    
    // Create CNS orchestrator
    this.cns = new CNSOrchestrator();
    
    // Create state bus
    this.stateBus = new StateBus();
    
    // Create signal router
    this.signalRouter = new SignalRouter();
    
    // Register state bus and router with CNS
    this.cns.register('state-bus', this.stateBus, COMPONENT_TYPES.ENGINE);
    this.cns.register('signal-router', this.signalRouter, COMPONENT_TYPES.ENGINE);
  }

  /**
   * Phase 2a: Initialize engines
   */
  async initializeEngines() {
    if (!this.config.engines.enabled) return;
    
    console.log('[UnifiedOrganism] Phase 2a: Initializing engines...');
    
    this.engines = createEngines();
    
    // Register each engine with CNS
    for (const [engineId, engine] of Object.entries(this.engines)) {
      this.cns.register(engineId, engine, COMPONENT_TYPES.ENGINE);
      this.signalRouter.registerComponent(engineId, {
        type: COMPONENT_TYPES.ENGINE,
        priority: 10, // Engines have high priority
      });
    }
  }

  /**
   * Phase 2b: Initialize agents
   */
  async initializeAgents() {
    if (!this.config.agents.enabled) return;
    
    console.log('[UnifiedOrganism] Phase 2b: Initializing agents...');
    
    this.agents = createAgents(this.engines);
    
    // Register each agent with CNS
    for (const [agentId, agent] of Object.entries(this.agents)) {
      this.cns.register(agentId.toUpperCase(), agent, COMPONENT_TYPES.AGENT);
      this.signalRouter.registerComponent(agentId.toUpperCase(), {
        type: COMPONENT_TYPES.AGENT,
        priority: 8, // Agents have high priority
      });
      
      // Subscribe agents to relevant signals
      this.subscribeAgentToSignals(agentId.toUpperCase(), agent);
    }
  }

  /**
   * Phase 3a: Initialize Spider MoE
   */
  async initializeSpiderMoE() {
    console.log('[UnifiedOrganism] Phase 3a: Initializing Spider MoE...');
    
    this.spiderMoE = {
      blackwxdow: this.config.spiderMoE.blackwxdow ? new BLACKWXDOW() : null,
      jumper: this.config.spiderMoE.jumper ? new JUMPER() : null,
    };
    
    if (this.spiderMoE.blackwxdow) {
      this.cns.register('BLACKWXDOW', this.spiderMoE.blackwxdow, COMPONENT_TYPES.AGENT);
    }
    if (this.spiderMoE.jumper) {
      this.cns.register('JUMPER', this.spiderMoE.jumper, COMPONENT_TYPES.AGENT);
    }
  }

  /**
   * Phase 3b: Initialize Nova Intelligence Bridge
   */
  async initializeNovaBridge() {
    console.log('[UnifiedOrganism] Phase 3b: Initializing Nova Bridge...');
    
    this.novaBridge = new IntelligenceBridge();
    this.cns.register('NOVA-BRIDGE', this.novaBridge, COMPONENT_TYPES.ENGINE);
  }

  /**
   * Phase 4: Initialize Organism Arms (sensory-motor)
   */
  async initializeOrganismArms() {
    console.log('[UnifiedOrganism] Phase 4: Initializing Organism Arms...');
    
    this.armRegistry = new ArmRegistry();
    this.armExecutor = new ArmExecutor(this.armRegistry);
    this.bidirectionalRelay = new BidirectionalRelay();
    this.senseActLoop = new SenseActLoop(this.armExecutor);
    
    // Register with CNS
    this.cns.register('ARM-REGISTRY', this.armRegistry, COMPONENT_TYPES.ENGINE);
    this.cns.register('ARM-EXECUTOR', this.armExecutor, COMPONENT_TYPES.ENGINE);
    this.cns.register('BIDIRECTIONAL-RELAY', this.bidirectionalRelay, COMPONENT_TYPES.ENGINE);
    this.cns.register('SENSE-ACT-LOOP', this.senseActLoop, COMPONENT_TYPES.ARM);
  }

  /**
   * Phase 5: Initialize Kingdom Organs
   */
  async initializeOrgans() {
    console.log('[UnifiedOrganism] Phase 5: Initializing Kingdom Organs...');
    
    // Power organ (circulatory system)
    if (this.config.organs.power.enabled) {
      this.organs.power = new PowerGrid();
      this.cns.register('POWER-GRID', this.organs.power, COMPONENT_TYPES.ORGAN);
    }
    
    // Thermal organ (cooling system)
    if (this.config.organs.thermal.enabled) {
      this.organs.thermal = {
        reservoir: new H2OReservoir(),
        cooling: new CoolingGenerator(),
      };
      this.cns.register('H2O-RESERVOIR', this.organs.thermal.reservoir, COMPONENT_TYPES.ORGAN);
      this.cns.register('COOLING-SYSTEM', this.organs.thermal.cooling, COMPONENT_TYPES.ORGAN);
    }
    
    // Immune organ (gate keepers)
    if (this.config.organs.immune.enabled) {
      this.organs.immune = new GateKeeper();
      this.cns.register('IMMUNE-SYSTEM', this.organs.immune, COMPONENT_TYPES.ORGAN);
    }
    
    // Treasury organ (resource management)
    if (this.config.organs.treasury.enabled) {
      this.organs.treasury = new RoyalTreasury();
      this.cns.register('TREASURY', this.organs.treasury, COMPONENT_TYPES.ORGAN);
    }
  }

  /**
   * Phase 6: Initialize Protocol Mesh
   */
  async initializeProtocolMesh() {
    console.log('[UnifiedOrganism] Phase 6: Initializing Protocol Mesh...');
    
    this.protocolMesh = {
      protocols: {},
      activeProtocol: null,
    };
    
    // Register key protocols with CNS
    // (In v2.0, protocols become communication pathways managed by CNS)
    if (this.config.protocols.autoRegister) {
      // Register a subset of critical protocols
      const criticalProtocols = [
        'SovereignRoutingProtocol',
        'EncryptedIntelligenceTransport',
        'PhiResonanceSyncProtocol',
      ];
      
      for (const protocolName of criticalProtocols) {
        if (Protocols[protocolName]) {
          const protocol = new Protocols[protocolName]();
          this.protocolMesh.protocols[protocolName] = protocol;
          this.cns.register(protocolName, protocol, COMPONENT_TYPES.PROTOCOL);
        }
      }
    }
  }

  /**
   * Phase 7: Wire all components together
   */
  async wireComponents() {
    console.log('[UnifiedOrganism] Phase 7: Wiring components...');
    
    // Wire SENSUS ← Organism Arms (senses feed into SENSUS)
    if (this.agents?.sensus && this.senseActLoop) {
      this.wireSensusToOrganismArms();
    }
    
    // Wire CORPUS → Organism Arms (actions execute through CORPUS)
    if (this.agents?.corpus && this.armExecutor) {
      this.wireCorpusToOrganismArms();
    }
    
    // Wire ANIMUS ← Spider MoE (intelligence augmentation)
    if (this.agents?.animus && this.spiderMoE) {
      this.wireAnimusToSpiderMoE();
    }
    
    // Wire ANIMUS ← Nova Bridge (compute augmentation)
    if (this.agents?.animus && this.novaBridge) {
      this.wireAnimusToNovaBridge();
    }
    
    // Wire agents to each other for bidirectional communication
    this.wireAgentsTogether();
    
    // Wire organs to CNS for coordination
    this.wireOrgansToCNS();
    
    console.log('[UnifiedOrganism] All components wired');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // WIRING METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Wire SENSUS to Organism Arms
   */
  wireSensusToOrganismArms() {
    const sensus = this.agents.sensus;
    
    // Add hook to send sense-act loop results to SENSUS
    const originalRunCycle = this.senseActLoop.runOnce.bind(this.senseActLoop);
    this.senseActLoop.runOnce = async (context) => {
      const result = await originalRunCycle(context);
      
      // Send sensory data to SENSUS via CNS
      if (result.sensed && result.sensed.length > 0) {
        this.cns.sendSignal(
          SIGNAL_TYPES.SENSORY_INPUT,
          { sensed: result.sensed },
          'SENSE-ACT-LOOP',
          { targetId: 'SENSUS', priority: 9 }
        );
      }
      
      return result;
    };
  }

  /**
   * Wire CORPUS to Organism Arms
   */
  wireCorpusToOrganismArms() {
    const corpus = this.agents.corpus;
    
    // Add method to CORPUS to execute actions through arms
    corpus.executeAction = async (action) => {
      // Send action to arm executor via CNS
      this.cns.sendSignal(
        SIGNAL_TYPES.ACTION,
        action,
        'CORPUS',
        { targetId: 'ARM-EXECUTOR', priority: 8 }
      );
    };
  }

  /**
   * Wire ANIMUS to Spider MoE
   */
  wireAnimusToSpiderMoE() {
    const animus = this.agents.animus;
    
    // Set affinity for intelligence routing
    if (this.spiderMoE.blackwxdow) {
      this.signalRouter.setAffinity('ANIMUS', 'BLACKWXDOW', PHI);
    }
    if (this.spiderMoE.jumper) {
      this.signalRouter.setAffinity('ANIMUS', 'JUMPER', PHI);
    }
  }

  /**
   * Wire ANIMUS to Nova Bridge
   */
  wireAnimusToNovaBridge() {
    const animus = this.agents.animus;
    
    // Set affinity for compute routing
    this.signalRouter.setAffinity('ANIMUS', 'NOVA-BRIDGE', PHI);
  }

  /**
   * Wire agents together for bidirectional communication
   */
  wireAgentsTogether() {
    // Set high affinities between core agents
    const agents = ['ANIMUS', 'CORPUS', 'SENSUS', 'MEMORIA'];
    
    for (const agent1 of agents) {
      for (const agent2 of agents) {
        if (agent1 !== agent2) {
          this.signalRouter.setAffinity(agent1, agent2, PHI);
        }
      }
    }
  }

  /**
   * Wire organs to CNS
   */
  wireOrgansToCNS() {
    // Organs report status to CNS and receive commands from ANIMUS
    const organIds = ['POWER-GRID', 'H2O-RESERVOIR', 'COOLING-SYSTEM', 'IMMUNE-SYSTEM', 'TREASURY'];
    
    for (const organId of organIds) {
      if (this.cns.hasComponent(organId)) {
        // Set affinity from ANIMUS to organs
        this.signalRouter.setAffinity('ANIMUS', organId, PHI);
        
        // Subscribe organs to system signals
        this.cns.subscribeToSignals(organId, [
          SIGNAL_TYPES.HEARTBEAT,
          SIGNAL_TYPES.STATUS_CHECK,
        ]);
      }
    }
  }

  /**
   * Subscribe agent to relevant signals
   */
  subscribeAgentToSignals(agentId, agent) {
    switch (agentId) {
      case 'SENSUS':
        this.cns.subscribeToSignals(agentId, [
          SIGNAL_TYPES.SENSORY_INPUT,
          SIGNAL_TYPES.HEARTBEAT,
        ]);
        break;
      
      case 'ANIMUS':
        this.cns.subscribeToSignals(agentId, [
          SIGNAL_TYPES.THOUGHT,
          SIGNAL_TYPES.DECISION,
          SIGNAL_TYPES.HEARTBEAT,
        ]);
        break;
      
      case 'CORPUS':
        this.cns.subscribeToSignals(agentId, [
          SIGNAL_TYPES.ACTION,
          SIGNAL_TYPES.HEARTBEAT,
        ]);
        break;
      
      case 'MEMORIA':
        this.cns.subscribeToSignals(agentId, [
          SIGNAL_TYPES.MEMORY_STORE,
          SIGNAL_TYPES.MEMORY_RETRIEVE,
          SIGNAL_TYPES.HEARTBEAT,
        ]);
        break;
    }
    
    // Subscribe to heartbeat
    this.cns.subscribeToHeartbeat(agentId);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HEALTH MONITORING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Start health monitoring loop
   */
  startHealthMonitoring() {
    this.healthMonitorInterval = setInterval(async () => {
      await this.cns.checkHealth();
      
      // Optimize pathways periodically
      if (Math.random() < 0.1) { // 10% chance per check
        this.signalRouter.optimizePathways();
      }
    }, this.config.cns.healthCheckInterval);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get organism status
   */
  getStatus() {
    return {
      version: this.version,
      name: this.name,
      initialized: this.initialized,
      active: this.active,
      bootstrapTime: this.bootstrapTime,
      cns: this.cns ? this.cns.getHealthStatus() : null,
      router: this.signalRouter ? this.signalRouter.getStats() : null,
      stateBus: this.stateBus ? this.stateBus.getStats() : null,
    };
  }

  /**
   * Send signal through CNS
   */
  sendSignal(signalType, payload, sourceId, options) {
    if (!this.cns) throw new Error('CNS not initialized');
    return this.cns.sendSignal(signalType, payload, sourceId, options);
  }

  /**
   * Set shared state
   */
  setState(key, value, metadata) {
    if (!this.stateBus) throw new Error('State bus not initialized');
    return this.stateBus.set(key, value, metadata);
  }

  /**
   * Get shared state
   */
  getState(key, defaultValue) {
    if (!this.stateBus) throw new Error('State bus not initialized');
    return this.stateBus.get(key, defaultValue);
  }
}

/**
 * Main bootstrap function for v2.0
 * 
 * @param {Object} config - Organism configuration
 * @returns {Promise<UnifiedOrganism>} Initialized organism
 */
export async function bootstrapOrganism(config = {}) {
  const organism = new UnifiedOrganism(config);
  await organism.bootstrap();
  await organism.activate();
  return organism;
}

// Default export
export default bootstrapOrganism;
