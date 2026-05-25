/**
 * 🧪 Flow State Machine Tests
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Test suite for the multi-flow state modeling and execution system.
 *
 * Run with: node --test test/organism/flow-system.test.js
 */

'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const { 
  FlowStateMachine, 
  STATE_TRANSITIONS,
  PHI,
} = require('../../organism/flow-state-machine');

const {
  FlowOrchestrator,
  createHeartbeatFlow,
  createDivergenceFlow,
} = require('../../organism/flow-orchestrator');

// ── FlowStateMachine Tests ────────────────────────────────────────────────────

describe('FlowStateMachine', () => {
  let fsm;

  beforeEach(() => {
    fsm = new FlowStateMachine({ id: 'test-fsm', name: 'Test Flow' });
  });

  describe('State Transitions', () => {
    it('should initialize in idle state', () => {
      assert.strictEqual(fsm.getState(), 'idle');
    });

    it('should transition from idle to initializing on START', () => {
      const result = fsm.transition('START');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.from, 'idle');
      assert.strictEqual(result.to, 'initializing');
      assert.strictEqual(fsm.getState(), 'initializing');
    });

    it('should reject invalid transitions', () => {
      const result = fsm.transition('COMPLETE');
      assert.strictEqual(result.success, false);
      assert.strictEqual(fsm.getState(), 'idle');
    });

    it('should track transition metrics', () => {
      fsm.transition('START');
      fsm.transition('INITIALIZED');
      assert.strictEqual(fsm.metrics.totalTransitions, 2);
    });

    it('should handle full lifecycle transitions', () => {
      assert.strictEqual(fsm.canTransition('START'), true);
      fsm.transition('START');
      assert.strictEqual(fsm.canTransition('INITIALIZED'), true);
      fsm.transition('INITIALIZED');
      assert.strictEqual(fsm.canTransition('COMPLETE'), true);
      fsm.transition('COMPLETE');
      assert.strictEqual(fsm.getState(), 'completed');
    });
  });

  describe('Flow Definition', () => {
    it('should load a flow definition', () => {
      const definition = {
        id: 'test-flow',
        name: 'Test Flow',
        nodes: [
          { id: 'node1', name: 'Node 1' },
          { id: 'node2', name: 'Node 2', dependencies: ['node1'] },
        ],
        edges: { node1: ['node2'] },
        entryNode: 'node1',
        exitNodes: ['node2'],
      };

      const result = fsm.loadFlow(definition);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.nodesLoaded, 2);
      assert.strictEqual(result.edgesLoaded, 1);
    });

    it('should add nodes dynamically', () => {
      const node = fsm.addNode({ id: 'dynamic-node', name: 'Dynamic Node' });
      assert.strictEqual(node.id, 'dynamic-node');
      assert.strictEqual(fsm.nodes.size, 1);
    });

    it('should add edges dynamically', () => {
      fsm.addNode({ id: 'n1', name: 'N1' });
      fsm.addNode({ id: 'n2', name: 'N2' });
      fsm.addEdge('n1', 'n2');
      assert.deepStrictEqual(fsm.edges.get('n1'), ['n2']);
    });
  });

  describe('Flow Execution', () => {
    beforeEach(() => {
      const definition = {
        id: 'exec-flow',
        name: 'Execution Flow',
        nodes: [
          { 
            id: 'step1', 
            name: 'Step 1',
            execute: (node, ctx) => {
              ctx.step1Done = true;
              return { success: true, value: 42 };
            },
          },
          { 
            id: 'step2', 
            name: 'Step 2',
            dependencies: ['step1'],
            execute: (node, ctx) => {
              return { success: true, step1Done: ctx.step1Done };
            },
          },
        ],
        edges: { step1: ['step2'] },
        entryNode: 'step1',
        exitNodes: ['step2'],
      };
      fsm.loadFlow(definition);
    });

    it('should start flow execution', () => {
      const result = fsm.start();
      assert.strictEqual(result.success, true);
      assert.strictEqual(fsm.getState(), 'running');
    });

    it('should process nodes on pulse', () => {
      fsm.start();
      const pulseResult = fsm.pulse();
      assert.strictEqual(pulseResult.processed, 1); // step1
      assert.strictEqual(fsm.completedNodes.size, 1);
    });

    it('should respect dependencies', () => {
      fsm.start();
      fsm.pulse(); // Execute step1
      const node2 = fsm.getNode('step2');
      assert.strictEqual(node2.state, 'pending'); // Not yet executed
      
      fsm.pulse(); // Execute step2 (dependencies now met)
      assert.strictEqual(fsm.completedNodes.has('step2'), true);
    });

    it('should complete flow when all nodes are done', () => {
      fsm.start();
      fsm.pulse();
      fsm.pulse();
      assert.strictEqual(fsm.getState(), 'completed');
    });

    it('should track progress correctly', () => {
      fsm.start();
      assert.strictEqual(fsm.getProgress(), 0);
      fsm.pulse();
      assert.strictEqual(fsm.getProgress(), 50);
      fsm.pulse();
      assert.strictEqual(fsm.getProgress(), 100);
    });
  });

  describe('Flow Control', () => {
    beforeEach(() => {
      fsm.loadFlow({
        id: 'control-flow',
        nodes: [{ id: 'n1', name: 'N1' }],
        edges: {},
        entryNode: 'n1',
        exitNodes: ['n1'],
      });
      fsm.start();
    });

    it('should pause and resume flow', () => {
      assert.strictEqual(fsm.pause().success, true);
      assert.strictEqual(fsm.getState(), 'paused');
      assert.strictEqual(fsm.resume().success, true);
      assert.strictEqual(fsm.getState(), 'running');
    });

    it('should reset flow', () => {
      fsm.pulse();
      fsm.reset();
      assert.strictEqual(fsm.getState(), 'idle');
      assert.strictEqual(fsm.completedNodes.size, 0);
    });
  });

  describe('Error Handling & Healing', () => {
    it('should handle node execution errors', () => {
      fsm.loadFlow({
        id: 'error-flow',
        nodes: [{
          id: 'error-node',
          name: 'Error Node',
          maxRetries: 1,
          execute: () => { throw new Error('Test error'); },
        }],
        edges: {},
        entryNode: 'error-node',
        exitNodes: ['error-node'],
      });

      fsm.start();
      fsm.pulse(); // First attempt + retry
      fsm.pulse(); // Final failure
      
      const node = fsm.getNode('error-node');
      assert.strictEqual(node.state, 'error');
    });

    it('should retry failed nodes', () => {
      let attempts = 0;
      fsm.loadFlow({
        id: 'retry-flow',
        nodes: [{
          id: 'retry-node',
          name: 'Retry Node',
          maxRetries: 3,
          execute: () => {
            attempts++;
            if (attempts < 2) throw new Error('Fail');
            return { success: true };
          },
        }],
        edges: {},
        entryNode: 'retry-node',
        exitNodes: ['retry-node'],
      });

      fsm.start();
      fsm.pulse(); // Fail, retry
      fsm.pulse(); // Succeed
      
      const node = fsm.getNode('retry-node');
      assert.strictEqual(node.state, 'done');
      assert.strictEqual(attempts, 2);
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize flow state', () => {
      fsm.loadFlow({
        id: 'serial-flow',
        nodes: [{ id: 'n1', name: 'N1' }],
        edges: {},
        entryNode: 'n1',
        exitNodes: ['n1'],
      });
      fsm.start();
      fsm.pulse();

      const serialized = fsm.serialize();
      
      const fsm2 = new FlowStateMachine();
      const result = fsm2.deserialize(serialized);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(fsm2.state, 'completed');
      assert.strictEqual(fsm2.completedNodes.has('n1'), true);
    });
  });
});

// ── FlowOrchestrator Tests ────────────────────────────────────────────────────

describe('FlowOrchestrator', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new FlowOrchestrator({ 
      id: 'test-orchestrator',
      heartbeatMs: 100, // Fast for testing
      maxConcurrentFlows: 2,
    });
  });

  describe('Flow Registration', () => {
    it('should register flows', () => {
      const result = orchestrator.registerFlow('flow1', {
        name: 'Flow 1',
        nodes: [{ id: 'n1', name: 'N1' }],
        edges: {},
        entryNode: 'n1',
        exitNodes: ['n1'],
      });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(orchestrator.flows.size, 1);
    });

    it('should register flows with dependencies', () => {
      orchestrator.registerFlow('flow1', { name: 'Flow 1', nodes: [], edges: {} });
      orchestrator.registerFlow('flow2', { name: 'Flow 2', nodes: [], edges: {} }, ['flow1']);
      
      const deps = orchestrator.flowDependencies.get('flow2');
      assert.deepStrictEqual(deps, ['flow1']);
    });
  });

  describe('Flow Queuing', () => {
    beforeEach(() => {
      orchestrator.registerFlow('q-flow', {
        name: 'Queue Flow',
        nodes: [{ id: 'n1', name: 'N1' }],
        edges: {},
        entryNode: 'n1',
        exitNodes: ['n1'],
      });
    });

    it('should queue flows', () => {
      const result = orchestrator.queueFlow('q-flow');
      assert.strictEqual(result.success, true);
      assert.strictEqual(orchestrator.flowQueue.length, 1);
    });

    it('should reject unknown flow IDs', () => {
      const result = orchestrator.queueFlow('unknown');
      assert.strictEqual(result.success, false);
    });
  });

  describe('Heartbeat Loop', () => {
    beforeEach(() => {
      orchestrator.registerFlow('hb-flow', {
        name: 'Heartbeat Flow',
        nodes: [{
          id: 'n1',
          name: 'N1',
          execute: () => ({ success: true }),
        }],
        edges: {},
        entryNode: 'n1',
        exitNodes: ['n1'],
      });
    });

    it('should start and stop', () => {
      assert.strictEqual(orchestrator.start().success, true);
      assert.strictEqual(orchestrator.state, 'running');
      assert.strictEqual(orchestrator.stop().success, true);
      assert.strictEqual(orchestrator.state, 'stopped');
    });

    it('should execute heartbeat', () => {
      orchestrator.queueFlow('hb-flow');
      orchestrator.state = 'running'; // Manual set for test
      
      const result = orchestrator.heartbeat();
      // Result should be an object with heartbeat data, not false
      assert.strictEqual(typeof result.heartbeat, 'number');
      assert.strictEqual(typeof result.nodesProcessed, 'number');
    });

    it('should track heartbeat metrics', () => {
      orchestrator.state = 'running';
      orchestrator.heartbeat();
      orchestrator.heartbeat();
      assert.strictEqual(orchestrator.metrics.heartbeatCount, 2);
    });
  });

  describe('Agent Integration', () => {
    it('should register agents', () => {
      orchestrator.registerAgent('agent1', { name: 'Test Agent' });
      assert.strictEqual(Object.keys(orchestrator.agents).length, 1);
    });

    it('should update agent health', () => {
      orchestrator.registerAgent('agent1', { name: 'Test Agent' });
      orchestrator.updateAgentHealth('agent1', { status: 'degraded' });
      assert.strictEqual(orchestrator.agents.agent1.status, 'degraded');
    });

    it('should check agent health', () => {
      orchestrator.registerAgent('agent1', { name: 'Test Agent' });
      const results = orchestrator.checkAgentHealth();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].status, 'active');
    });
  });

  describe('Pre-built Flows', () => {
    it('should create heartbeat flow', () => {
      const flow = createHeartbeatFlow();
      assert.strictEqual(flow.id, 'heartbeat-flow');
      assert.strictEqual(flow.nodes.length, 4);
    });

    it('should create divergence flow', () => {
      const flow = createDivergenceFlow();
      assert.strictEqual(flow.id, 'divergence-flow');
      assert.strictEqual(flow.nodes.length, 4);
    });

    it('should execute heartbeat flow', () => {
      orchestrator.registerFlow('hb', createHeartbeatFlow());
      orchestrator.queueFlow('hb', { agents: { a1: { status: 'active' } } });
      orchestrator.state = 'running';
      orchestrator._processFlowQueue();
      
      const fsm = orchestrator.flows.get('hb');
      // Should have started
      assert.strictEqual(fsm.state, 'running');
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize orchestrator', () => {
      orchestrator.registerFlow('ser-flow', {
        name: 'Serial Flow',
        nodes: [{ id: 'n1', name: 'N1' }],
        edges: {},
        entryNode: 'n1',
        exitNodes: ['n1'],
      });
      orchestrator.registerAgent('agent1', { name: 'Agent' });

      const serialized = orchestrator.serialize();
      
      const orchestrator2 = new FlowOrchestrator();
      const result = orchestrator2.deserialize(serialized);
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(orchestrator2.flows.size, 1);
      assert.strictEqual(Object.keys(orchestrator2.agents).length, 1);
    });
  });

  describe('Status & Metrics', () => {
    it('should return comprehensive status', () => {
      orchestrator.registerFlow('stat-flow', {
        name: 'Status Flow',
        nodes: [{ id: 'n1', name: 'N1' }],
        edges: {},
        entryNode: 'n1',
        exitNodes: ['n1'],
      });
      orchestrator.registerAgent('agent1', { name: 'Agent' });

      const status = orchestrator.getStatus();
      
      assert.strictEqual(status.id, 'test-orchestrator');
      assert.strictEqual(status.flows.total, 1);
      assert.strictEqual(status.agents.total, 1);
    });

    it('should return aggregate metrics', () => {
      const metrics = orchestrator.getAggregateMetrics();
      assert.strictEqual(typeof metrics.healthScore, 'number');
      assert.strictEqual(typeof metrics.phiResonance, 'number');
    });
  });
});

// ── State Transition Table Tests ──────────────────────────────────────────────

describe('STATE_TRANSITIONS', () => {
  it('should have all required states', () => {
    const expectedStates = ['idle', 'initializing', 'running', 'paused', 'completed', 'failed', 'healing'];
    for (const state of expectedStates) {
      assert.ok(STATE_TRANSITIONS[state], `Missing state: ${state}`);
    }
  });

  it('should define idle -> running path', () => {
    assert.strictEqual(STATE_TRANSITIONS.idle.START, 'initializing');
    assert.strictEqual(STATE_TRANSITIONS.initializing.INITIALIZED, 'running');
  });

  it('should define error recovery paths', () => {
    assert.strictEqual(STATE_TRANSITIONS.failed.RETRY, 'initializing');
    assert.strictEqual(STATE_TRANSITIONS.failed.HEAL, 'healing');
    assert.strictEqual(STATE_TRANSITIONS.healing.HEALED, 'running');
  });
});

// ── PHI Constant Test ─────────────────────────────────────────────────────────

describe('PHI Constant', () => {
  it('should be the golden ratio', () => {
    assert.ok(Math.abs(PHI - 1.618033988749895) < 0.0000001);
  });

  it('should satisfy phi property: phi^2 = phi + 1', () => {
    const phi2 = PHI * PHI;
    const phiPlus1 = PHI + 1;
    assert.ok(Math.abs(phi2 - phiPlus1) < 0.0000001);
  });
});
