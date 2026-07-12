'use strict';

const { NexusAgent  } = require('./nexus/index.js');
const { PythiaAgent } = require('./pythia/index.js');
const { VigilAgent  } = require('./vigil/index.js');
const { NovaAgent   } = require('./nova/index.js');
const { PlexaAgent  } = require('./plexa/index.js');
const { HermesAgent } = require('./hermes/index.js');

/**
 * Foundation Model Layer — 6 sovereign agents built entirely from the
 * ItsNotAILABS system: protocols, registers, SDKs, physics. No third-party
 * intelligence APIs are called. The registers ARE the training corpus.
 *
 *   NEXUS  — Sovereign Intelligence Router       (251-protocol routing table, phi-decay learning)
 *   PYTHIA — Knowledge Synthesis Deep Learner    (TF-IDF over all registers, no embedding API)
 *   VIGIL  — Governance & Sovereign Guardian     (Architectural Laws compliance audit + artifact signing)
 *   NOVA   — Neural Emergence Intelligence       (96-node Kuramoto connectome, 24 neurochemicals)
 *   PLEXA  — Multi-Model Fusion Orchestrator     (phi-decay ensemble consensus, model capability matrix)
 *   HERMES — Cross-Platform Deployment Executor  (Cloudflare + ICP + npm one-shot deploy)
 */
function bootstrapFoundation(options = {}) {
  const agents = {
    nexus:  new NexusAgent(),
    pythia: new PythiaAgent(),
    vigil:  new VigilAgent(),
    nova:   new NovaAgent(options.nodeCount || 96, options.seed || null),
    plexa:  new PlexaAgent(),
    hermes: new HermesAgent(),
  };

  // Cross-wire: Nexus uses Nova's coherence to weight routing confidence
  agents.nexus._nova = agents.nova;

  // Cross-wire: Vigil uses Pythia's index to enrich audit reports
  agents.vigil._pythia = agents.pythia;

  return {
    ...agents,
    status() {
      return Object.fromEntries(
        Object.entries(agents).map(([k, a]) => [k, a.status()])
      );
    },
  };
}

module.exports = { bootstrapFoundation, NexusAgent, PythiaAgent, VigilAgent, NovaAgent, PlexaAgent, HermesAgent };
