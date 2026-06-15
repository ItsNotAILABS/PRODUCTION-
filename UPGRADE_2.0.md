# UPGRADE GUIDE: Version 2.0 Unified Organism Architecture

## Overview

Version 2.0 represents a major architectural upgrade that unifies all organism components through a Central Nervous System (CNS). All subsystems—engines, agents, organs, protocols, and intelligence systems—are now wired together into a single, coordinated organism.

## What's New in v2.0

### 🧠 Central Nervous System (CNS)
- **CNSOrchestrator**: Central coordination hub for all components
- **StateBus**: Organism-wide state management with φ-enhanced conflict resolution
- **SignalRouter**: Intelligent signal routing with golden ratio weighted pathways
- **Unified Heartbeat**: Single 873ms × φ heartbeat across entire organism

### 🔗 Unified Integration
- All agents communicate bidirectionally through CNS
- Engines connected to CNS for coordinated operation
- Kingdom organs integrated as support systems (not separate entities)
- Protocol mesh provides 253 communication pathways
- Organism Arms wired directly to SENSUS/CORPUS
- Spider MoE and Nova Bridge augment ANIMUS intelligence

### 🏥 Health & Self-Healing
- Automatic component health monitoring
- Failure detection with automatic recovery
- Self-healing mechanisms for degraded components
- Real-time pathway optimization

### ⚡ Performance Enhancements
- φ-enhanced signal routing reduces latency
- Load balancing across components
- Intelligent pathway selection
- State synchronization with priority queues

## Migration Path

### Quick Start (Recommended)

**Old v1.x Code:**
```javascript
import { bootstrapCivitas } from '@medina/civitas-intelligentiae';

const civitas = bootstrapCivitas('my-meridian', 'civitas-001');
// Agents run but are not fully coordinated
```

**New v2.0 Code:**
```javascript
import { bootstrapOrganism } from '@medina/civitas-intelligentiae';

const organism = await bootstrapOrganism({
  name: 'MyOrganism',
  version: '2.0.0',
});
// Entire organism activated with all systems wired
```

### Detailed Migration Steps

#### 1. Update Imports

**Old:**
```javascript
import { 
  bootstrapCivitas,
  CivitasRuntime,
  createEngines,
  createAgents 
} from '@medina/civitas-intelligentiae';
```

**New:**
```javascript
import { 
  bootstrapOrganism,    // New unified bootstrap
  UnifiedOrganism,      // New organism class
  CNSOrchestrator,      // Central coordinator
  StateBus,             // Shared state
  SignalRouter,         // Intelligent routing
} from '@medina/civitas-intelligentiae';

// v1.x imports still work but show deprecation warnings
import { bootstrapCivitas } from '@medina/civitas-intelligentiae';  // ⚠️  Deprecated
```

#### 2. Update Bootstrap Call

**Old v1.x:**
```javascript
const civitas = bootstrapCivitas('meridian', 'id');

// Start agents manually
civitas.agents.animus.awaken();
civitas.agents.corpus.awaken();
```

**New v2.0:**
```javascript
const organism = await bootstrapOrganism({
  name: 'MyOrganism',
  
  // Core systems
  engines: { enabled: true },
  agents: { enabled: true, autoStart: true },
  
  // Intelligence augmentation
  spiderMoE: { enabled: true, blackwxdow: true, jumper: true },
  novaBridge: { enabled: true },
  
  // Sensory-motor
  organismArms: { enabled: true, autoStartLoop: true },
  
  // Kingdom organs
  organs: {
    power: { enabled: true },
    thermal: { enabled: true },
    immune: { enabled: true },
    treasury: { enabled: true },
  },
  
  // Protocol mesh
  protocols: { enabled: true, autoRegister: true },
});

// All systems automatically started and wired
```

#### 3. Access Components

**Old v1.x:**
```javascript
// Direct access
civitas.agents.animus.think();
civitas.engines.chrono.setInterval(() => {}, 1);
```

**New v2.0:**
```javascript
// Access through organism
organism.agents.animus.think();
organism.engines.chrono.setInterval(() => {}, 1);

// Or access through CNS
const cns = organism.cns;
const animus = cns.getComponent('ANIMUS');

// Send signals through CNS
organism.sendSignal(
  'THOUGHT',
  { content: 'New thought' },
  'EXTERNAL',
  { targetId: 'ANIMUS', priority: 8 }
);
```

#### 4. State Management

**Old v1.x:**
```javascript
// State scattered across components
civitas.agents.animus.thoughts.push(thought);
civitas.engines.nexoris.set('cognitive', 'awareness', 1.0);
```

**New v2.0:**
```javascript
// Unified state bus
organism.setState('cognitive.awareness', 1.0, {
  source: 'ANIMUS',
  priority: 8,
});

const awareness = organism.getState('cognitive.awareness', 0.5);

// Subscribe to state changes
organism.stateBus.subscribe('cognitive.awareness', (value, entry) => {
  console.log(`Awareness changed to ${value}`);
});
```

#### 5. Component Communication

**Old v1.x:**
```javascript
// Direct coupling between components
civitas.agents.sensus.perceive(data);
civitas.agents.animus.think();
```

**New v2.0:**
```javascript
// Communication through CNS signals
organism.cns.sendSignal(
  'SENSORY_INPUT',
  { data: sensorData },
  'SENSUS',
  { targetId: 'ANIMUS', priority: 9 }
);

// Subscribe to signals
organism.cns.subscribeToSignals('MY-COMPONENT', ['THOUGHT', 'DECISION']);
```

#### 6. Health Monitoring

**New in v2.0:**
```javascript
// Get organism health status
const status = organism.getStatus();
console.log('Organism status:', status);

// Get CNS health
const healthStatus = organism.cns.getHealthStatus();
console.log('Component health:', healthStatus.components);

// Manual health check
await organism.cns.checkHealth();
```

## Configuration Options

### Default Configuration

```javascript
const DEFAULT_CONFIG = {
  name: 'UnifiedOrganism',
  version: '2.0.0',
  
  engines: { enabled: true },
  agents: { enabled: true, autoStart: true },
  
  spiderMoE: {
    enabled: true,
    blackwxdow: true,
    jumper: true,
  },
  
  novaBridge: { enabled: true },
  
  organismArms: {
    enabled: true,
    autoStartLoop: true,
  },
  
  organs: {
    power: { enabled: true },
    thermal: { enabled: true },
    immune: { enabled: true },
    treasury: { enabled: true },
  },
  
  protocols: {
    enabled: true,
    autoRegister: true,
  },
  
  cns: {
    autoStartHeartbeat: true,
    healthCheckInterval: 10000, // 10 seconds
  },
};
```

### Custom Configuration

```javascript
const organism = await bootstrapOrganism({
  name: 'CustomOrganism',
  
  // Enable only specific components
  agents: { enabled: true, autoStart: true },
  spiderMoE: { enabled: false },  // Disable Spider MoE
  organismArms: { enabled: false },  // Disable organism arms
  
  // Customize organ settings
  organs: {
    power: { enabled: true, capacity: 1000 },
    thermal: { enabled: true, maxTemp: 80 },
    immune: { enabled: true, threatLevel: 'medium' },
    treasury: { enabled: false },  // Disable treasury
  },
  
  // Customize CNS behavior
  cns: {
    autoStartHeartbeat: true,
    healthCheckInterval: 5000,  // Check every 5 seconds
  },
});
```

## Breaking Changes

### Removed/Changed APIs

1. **CivitasRuntime** (v1.x)
   - Still available but deprecated
   - Use `UnifiedOrganism` instead
   - CivitasRuntime will be removed in v3.0

2. **Direct Agent Access**
   - v1.x: `civitas.agents.animus`
   - v2.0: `organism.agents.animus` (still works)
   - **Recommended**: Use CNS: `organism.cns.getComponent('ANIMUS')`

3. **Manual Wiring**
   - v1.x: Manual agent wiring required
   - v2.0: Automatic wiring through CNS
   - Custom wiring still possible through CNS registration

### New Required Steps

1. **Async Bootstrap**
   - v1.x: `const civitas = bootstrapCivitas(...)`
   - v2.0: `const organism = await bootstrapOrganism(...)`
   - Note the `await` keyword is required

2. **Signal-Based Communication**
   - Recommended to use CNS signals instead of direct method calls
   - Provides better decoupling and monitoring

## Benefits of Upgrading

### 1. Unified Architecture
- All components communicate through CNS
- No more fragmented subsystems
- True emergent behavior from connected parts

### 2. Intelligence Augmentation
- Spider MoE (BLACKWXDOW + JUMPER) augments ANIMUS
- Nova Intelligence Bridge provides compute augmentation
- Seamless integration of multiple intelligence systems

### 3. Autonomous Operation
- Organism Arms provide sensory-motor interface
- Sense-act loop runs autonomously
- Self-healing and adaptation

### 4. Performance
- φ-enhanced signal routing
- Load balancing across components
- Intelligent pathway optimization

### 5. Observability
- Real-time health monitoring
- Component failure detection
- Comprehensive statistics

## Backward Compatibility

### v1.x API Support

All v1.x APIs continue to work in v2.0 with deprecation warnings:

```javascript
// v1.x code still works
import { bootstrapCivitas, createEngines, createAgents } from '@medina/civitas-intelligentiae';

const civitas = bootstrapCivitas('meridian');
// ⚠️  Warning: bootstrapCivitas() is deprecated in v2.0

const engines = createEngines();  // ✓ Still works
const agents = createAgents(engines);  // ✓ Still works
```

### Gradual Migration

You can gradually migrate by:

1. **Phase 1**: Use v2.0 but keep v1.x patterns
   ```javascript
   const organism = await bootstrapOrganism({});
   // Access agents the old way
   organism.agents.animus.awaken();
   ```

2. **Phase 2**: Adopt CNS for new code
   ```javascript
   // Keep old code as-is
   organism.agents.animus.think();
   
   // Use CNS for new features
   organism.sendSignal('THOUGHT', { content: 'new' }, 'SOURCE');
   ```

3. **Phase 3**: Full v2.0 adoption
   ```javascript
   // All communication through CNS
   const cns = organism.cns;
   cns.sendSignal(type, payload, source, options);
   ```

## Troubleshooting

### Common Issues

#### 1. "CNS not initialized"

**Problem:**
```javascript
organism.sendSignal(...);  // Error: CNS not initialized
```

**Solution:**
```javascript
const organism = await bootstrapOrganism({});  // Note the await
await organism.activate();  // Ensure activation complete
```

#### 2. "Component not registered"

**Problem:**
```javascript
cns.getComponent('MY-COMPONENT');  // null
```

**Solution:**
```javascript
// Register component first
organism.cns.register('MY-COMPONENT', component, COMPONENT_TYPES.AGENT);
```

#### 3. Signals not received

**Problem:**
```javascript
// Component not receiving signals
```

**Solution:**
```javascript
// Subscribe to signal types
organism.cns.subscribeToSignals('MY-COMPONENT', ['SIGNAL_TYPE']);

// Implement signal handler
component.onSignal = (signal) => {
  console.log('Received signal:', signal);
};
```

## Support & Resources

- **Documentation**: `/docs/v2.0/`
- **Examples**: `/examples/v2.0/`
- **Migration Tool**: `npm run migrate:v2`
- **Issues**: https://github.com/ItsNotAILABS/PRODUCTION-/issues

## Timeline

- **v2.0.0** (Current): Unified organism architecture released
- **v2.1.0** (Q3 2026): Enhanced protocol mesh, additional organs
- **v3.0.0** (2027): v1.x APIs removed, pure CNS architecture

## Questions?

For migration assistance, please open an issue or join our Discord community.

---

**Welcome to the Unified Organism v2.0! 🧠⚡**
