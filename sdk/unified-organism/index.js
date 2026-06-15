/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  UNIFIED ORGANISM v2.0 — Single Entry Point for Complete Organism            ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * The Unified Organism is the v2.0 architecture where all components are
 * wired together through a Central Nervous System (CNS) into a single,
 * living, coordinated system.
 * 
 * @module sdk/unified-organism
 * @version 2.0.0
 */

export { UnifiedOrganism, bootstrapOrganism, DEFAULT_CONFIG } from './bootstrap.js';
export { default } from './bootstrap.js';

// Re-export CNS for advanced usage
export { 
  CNSOrchestrator, 
  StateBus, 
  SignalRouter,
  SIGNAL_TYPES,
  COMPONENT_TYPES,
  CONNECTION_STATUS,
  ROUTING_STRATEGIES,
} from '../central-nervous-system/index.js';
