/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  CENTRAL NERVOUS SYSTEM (CNS) — Unified Organism Coordination                ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * The CNS is the central coordination layer that wires together all organism
 * components into a unified, living system.
 * 
 * @module sdk/central-nervous-system
 * @version 2.0.0
 */

export { CNSOrchestrator, SIGNAL_TYPES, COMPONENT_TYPES, CONNECTION_STATUS } from './cns-orchestrator.js';
export { StateBus, UPDATE_STRATEGIES } from './state-bus.js';
export { SignalRouter, ROUTING_STRATEGIES, ROUTE_SELECTION } from './signal-router.js';

// φ Constants
export const PHI = 1.618033988749895;
export const PHI_INV = 1 / 1.618033988749895;
export const HEARTBEAT_MS = 873;
export const GOLDEN_ANGLE = 137.508;

// CNS singleton (created when bootstrapping)
let _cnsInstance = null;

/**
 * Get the global CNS instance
 */
export function getCNS() {
  return _cnsInstance;
}

/**
 * Set the global CNS instance
 * (Called during organism bootstrap)
 */
export function setCNS(cnsInstance) {
  _cnsInstance = cnsInstance;
}

/**
 * Create a new CNS instance
 */
export function createCNS() {
  const { CNSOrchestrator } = await import('./cns-orchestrator.js');
  return new CNSOrchestrator();
}
