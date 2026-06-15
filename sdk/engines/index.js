/**
 * CORE ENGINES INDEX
 * 
 * The 4 foundational "physics" engines of Civitas:
 *   - CHRONO: Time & Scheduling
 *   - NEXORIS: State Management
 *   - QUANTUM_FLUX: Randomness & Entropy
 *   - COREOGRAPH: Orchestration
 * 
 * These are the substrate on which all agents operate.
 */

// Import singletons locally so they can be referenced below (re-export alone
// does NOT create a local binding — that was a load-time ReferenceError).
import { chronoEngine } from './chrono-engine.js';
import { nexorisEngine } from './nexoris-engine.js';
import { quantumFluxEngine } from './quantum-flux-engine.js';
import { coreographEngine } from './coreograph-engine.js';

export { ChronoEngine, PHI, PHI_INV, HEARTBEAT_MS, GOLDEN_ANGLE } from './chrono-engine.js';
export { NexorisEngine, REGISTERS, DIMENSIONS } from './nexoris-engine.js';
export { QuantumFluxEngine } from './quantum-flux-engine.js';
export { CoreographEngine, PRIORITY } from './coreograph-engine.js';
export { chronoEngine, nexorisEngine, quantumFluxEngine, coreographEngine };

// Re-export singletons as default engines
export const CHRONO = chronoEngine;
export const NEXORIS = nexorisEngine;
export const QUANTUM_FLUX = quantumFluxEngine;
export const COREOGRAPH = coreographEngine;

// Constants
export const ENGINE_CONSTANTS = {
  PHI: 1.618033988749895,
  PHI_INV: 1 / 1.618033988749895,
  HEARTBEAT_MS: 873,
  GOLDEN_ANGLE: 137.508,
  EMERGENCE_THRESHOLD: 0.618033988749895,
};

// Engine factory for creating isolated instances
export function createEngines() {
  return {
    chrono: new ChronoEngine(),
    nexoris: new NexorisEngine(),
    quantumFlux: new QuantumFluxEngine(),
    coreograph: new CoreographEngine(),
  };
}
