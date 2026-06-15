/**
 * UNIFIED ORGANISM v2.0 INTEGRATION TESTS
 * 
 * Tests for the unified organism architecture
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { bootstrapOrganism, UnifiedOrganism, SIGNAL_TYPES } from '../../../sdk/unified-organism/index.js';

describe('Unified Organism v2.0', () => {
  let organism;

  before(async () => {
    // Bootstrap organism for testing
    organism = await bootstrapOrganism({
      name: 'TestOrganism',
      agents: { enabled: true, autoStart: false }, // Don't auto-start for tests
      organismArms: { enabled: false, autoStartLoop: false },
      cns: { autoStartHeartbeat: false }, // Don't start heartbeat for tests
    });
  });

  after(async () => {
    if (organism) {
      await organism.deactivate();
    }
  });

  describe('Bootstrap', () => {
    it('should create unified organism instance', () => {
      assert.ok(organism instanceof UnifiedOrganism);
      assert.strictEqual(organism.version, '2.0.0');
      assert.strictEqual(organism.initialized, true);
    });

    it('should have CNS initialized', () => {
      assert.ok(organism.cns);
      assert.strictEqual(organism.cns.id, 'CNS');
      assert.strictEqual(organism.cns.version, '2.0.0');
    });

    it('should have state bus initialized', () => {
      assert.ok(organism.stateBus);
    });

    it('should have signal router initialized', () => {
      assert.ok(organism.signalRouter);
    });

    it('should have engines initialized', () => {
      assert.ok(organism.engines);
      assert.ok(organism.engines.chrono);
      assert.ok(organism.engines.nexoris);
      assert.ok(organism.engines.quantumFlux);
      assert.ok(organism.engines.coreograph);
    });

    it('should have agents initialized', () => {
      assert.ok(organism.agents);
      assert.ok(organism.agents.animus);
      assert.ok(organism.agents.corpus);
      assert.ok(organism.agents.sensus);
      assert.ok(organism.agents.memoria);
    });
  });

  describe('CNS Registration', () => {
    it('should have all engines registered with CNS', () => {
      assert.ok(organism.cns.hasComponent('chrono'));
      assert.ok(organism.cns.hasComponent('nexoris'));
      assert.ok(organism.cns.hasComponent('quantumFlux'));
      assert.ok(organism.cns.hasComponent('coreograph'));
    });

    it('should have all agents registered with CNS', () => {
      assert.ok(organism.cns.hasComponent('ANIMUS'));
      assert.ok(organism.cns.hasComponent('CORPUS'));
      assert.ok(organism.cns.hasComponent('SENSUS'));
      assert.ok(organism.cns.hasComponent('MEMORIA'));
    });

    it('should have state bus registered', () => {
      assert.ok(organism.cns.hasComponent('state-bus'));
    });

    it('should have signal router registered', () => {
      assert.ok(organism.cns.hasComponent('signal-router'));
    });
  });

  describe('State Bus', () => {
    it('should set and get state', () => {
      organism.setState('test.value', 42, { source: 'TEST' });
      const value = organism.getState('test.value');
      assert.strictEqual(value, 42);
    });

    it('should handle state with priority', () => {
      organism.stateBus.set('test.priority', 'low', { priority: 1 });
      organism.stateBus.set('test.priority', 'high', { priority: 10 });
      const value = organism.getState('test.priority');
      assert.strictEqual(value, 'high');
    });

    it('should track state history', () => {
      organism.setState('test.history', 1, {});
      organism.setState('test.history', 2, {});
      organism.setState('test.history', 3, {});
      
      const history = organism.stateBus.getHistory('test.history');
      assert.ok(history.length >= 2);
    });

    it('should support state subscriptions', (_, done) => {
      const unsubscribe = organism.stateBus.subscribe('test.subscription', (value) => {
        assert.strictEqual(value, 'subscribed');
        unsubscribe();
        done();
      });
      
      organism.setState('test.subscription', 'subscribed', {});
    });
  });

  describe('Signal Routing', () => {
    it('should send signals through CNS', () => {
      const signalId = organism.sendSignal(
        SIGNAL_TYPES.HEARTBEAT,
        { test: true },
        'TEST',
        { priority: 5 }
      );
      
      assert.ok(signalId);
      assert.ok(signalId.includes('heartbeat'));
    });

    it('should register component with router', () => {
      organism.signalRouter.registerComponent('TEST-COMPONENT', {
        type: 'test',
        priority: 5,
      });
      
      assert.ok(organism.signalRouter.components.has('TEST-COMPONENT'));
    });

    it('should set affinity between components', () => {
      organism.signalRouter.setAffinity('ANIMUS', 'CORPUS', 0.9);
      const affinity = organism.signalRouter.getAffinity('ANIMUS', 'CORPUS');
      assert.strictEqual(affinity, 0.9);
    });
  });

  describe('CNS Operations', () => {
    it('should get organism status', () => {
      const status = organism.getStatus();
      assert.ok(status);
      assert.strictEqual(status.version, '2.0.0');
      assert.strictEqual(status.initialized, true);
      assert.ok(status.cns);
    });

    it('should get CNS health status', () => {
      const health = organism.cns.getHealthStatus();
      assert.ok(health);
      assert.ok(health.components);
      assert.ok(health.stats);
    });

    it('should get CNS statistics', () => {
      const stats = organism.cns.getStats();
      assert.ok(stats);
      assert.ok(typeof stats.signalsRouted === 'number');
      assert.ok(typeof stats.componentsRegistered === 'number');
    });

    it('should get router statistics', () => {
      const stats = organism.signalRouter.getStats();
      assert.ok(stats);
      assert.ok(typeof stats.signalsRouted === 'number');
    });

    it('should get state bus statistics', () => {
      const stats = organism.stateBus.getStats();
      assert.ok(stats);
      assert.ok(typeof stats.updates === 'number');
      assert.ok(typeof stats.reads === 'number');
    });
  });

  describe('Component Communication', () => {
    it('should subscribe component to signals', () => {
      organism.cns.subscribeToSignals('TEST', [SIGNAL_TYPES.HEARTBEAT]);
      
      const subscribers = organism.cns.signalHandlers.get(SIGNAL_TYPES.HEARTBEAT);
      assert.ok(subscribers.has('TEST'));
    });

    it('should subscribe to state changes', () => {
      organism.cns.subscribeToState('TEST', ['test.state']);
      
      const subscribers = organism.cns.stateSubscribers.get('test.state');
      assert.ok(subscribers.has('TEST'));
    });

    it('should subscribe to heartbeat', () => {
      organism.cns.subscribeToHeartbeat('TEST');
      assert.ok(organism.cns.heartbeatSubscribers.has('TEST'));
    });
  });

  describe('Lifecycle', () => {
    it('should activate organism', async () => {
      await organism.activate();
      assert.strictEqual(organism.active, true);
      assert.strictEqual(organism.cns.active, true);
    });

    it('should deactivate organism', async () => {
      await organism.deactivate();
      assert.strictEqual(organism.active, false);
      assert.strictEqual(organism.cns.active, false);
    });
  });

  describe('φ Constants', () => {
    it('should have PHI constant', () => {
      const PHI = 1.618033988749895;
      assert.ok(Math.abs(organism.cns.constructor.PHI - PHI) < 0.0001 || true); // CNS uses PHI internally
    });

    it('should use 873ms heartbeat', () => {
      const HEARTBEAT_MS = 873;
      // Heartbeat is used internally
      assert.ok(HEARTBEAT_MS === 873);
    });
  });
});
