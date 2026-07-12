/**
 * PROTO-FED-002: Sovereign Federation Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Cross-substrate federation mesh: binds Cloudflare Workers, ICP canisters,
 * Lambda functions, and bare-metal nodes into a single sovereign network.
 *
 * Each substrate speaks the same message format (SovereignMessage) and
 * participates in the same phi-weighted routing and coherence measurement.
 * No central broker. No single point of failure.
 *
 * Substrate roles:
 *   GATEWAY   — public ingress, auth, load balancing
 *   WORKER    — intelligence processing (CF Workers)
 *   CANISTER  — permanent state, sovereign memory (ICP)
 *   RELAY     — cross-region routing and fan-out
 *   ORACLE    — external data bridge (finance, weather, etc.)
 */

'use strict';

const PHI     = 1.618033988749895;
const PHI_INV = 0.618033988749895;
const HEARTBEAT_MS = 873;

const SUBSTRATE = Object.freeze({
  GATEWAY:  'gateway',
  WORKER:   'worker',
  CANISTER: 'canister',
  RELAY:    'relay',
  ORACLE:   'oracle',
  EDGE:     'edge',
});

const MSG_TYPE = Object.freeze({
  HEARTBEAT:  'heartbeat',
  DELEGATE:   'delegate',
  BROADCAST:  'broadcast',
  QUERY:      'query',
  RESPONSE:   'response',
  SYNC:       'sync',
});

let _msgSeq = 0;

function sovereignMessage(type, from, to, payload = {}) {
  return {
    seq:       _msgSeq++,
    type,
    from,
    to,        // null = broadcast
    payload,
    ts:        Date.now(),
    phiScore:  payload.phiScore ?? 1.0,
    ring:      payload.ring ?? 'InterfaceRing',
  };
}

class SubstrateNode {
  constructor({ id, name, substrate, ring = 'InterfaceRing', endpoint = '' }) {
    this.id        = id;
    this.name      = name;
    this.substrate = substrate;
    this.ring      = ring;
    this.endpoint  = endpoint;
    this.phiScore  = 1.0;
    this.lastSeen  = Date.now();
    this.load      = 0.0;    // 0..1
    this.latencyMs = 0;
  }

  isAlive() { return Date.now() - this.lastSeen < HEARTBEAT_MS * 3; }
  touch()   { this.lastSeen = Date.now(); }

  toDict() {
    return {
      id: this.id, name: this.name, substrate: this.substrate,
      ring: this.ring, endpoint: this.endpoint,
      phiScore: this.phiScore.toFixed(4), alive: this.isAlive(),
      load: this.load.toFixed(3), latencyMs: this.latencyMs,
    };
  }
}

class SovereignFederation {
  constructor(selfNode) {
    this.self     = selfNode;
    this.nodes    = new Map();  // id → SubstrateNode
    this._log     = [];
    this._beat    = 0;
    this._routed  = 0;
    this._dropped = 0;
  }

  addNode(node) { this.nodes.set(node.id, node); }
  removeNode(id) { this.nodes.delete(id); }

  aliveNodes() {
    return Array.from(this.nodes.values()).filter(n => n.isAlive());
  }

  coherence() {
    if (this.nodes.size === 0) return 0;
    return this.aliveNodes().length / this.nodes.size;
  }

  /** Heartbeat from a node — updates its last-seen and phi-score. */
  heartbeat(id, latencyMs = 0) {
    const n = this.nodes.get(id);
    if (!n) return false;
    n.touch();
    n.latencyMs = latencyMs;
    n.phiScore  = Math.min(PHI, n.phiScore * (latencyMs < 100 ? PHI : PHI_INV));
    return true;
  }

  /**
   * Route a message to the best node for a given substrate type and ring.
   */
  route(msg, preferSubstrate = null, preferRing = null) {
    const candidates = this.aliveNodes().filter(n => {
      if (preferSubstrate && n.substrate !== preferSubstrate) return false;
      return true;
    });

    if (candidates.length === 0) {
      this._dropped++;
      return { routed: false, reason: 'no_candidates', msg };
    }

    // Score: phi-score * load-penalty * ring-affinity
    const RING_ORDER = ['SovereignRing','SovereignEdgeRing','CognitiveRing','NeuralRing',
                        'MemoryRing','RouteRing','AffectiveRing','SomaticRing',
                        'QuantumRing','TemporalRing','InterfaceRing'];
    const ringDist = (a, b) => Math.abs(RING_ORDER.indexOf(a) - RING_ORDER.indexOf(b));

    candidates.sort((a, b) => {
      const affA = Math.pow(PHI, -(preferRing ? ringDist(preferRing, a.ring) : 0));
      const affB = Math.pow(PHI, -(preferRing ? ringDist(preferRing, b.ring) : 0));
      const scoreA = a.phiScore * (1 - a.load) * affA;
      const scoreB = b.phiScore * (1 - b.load) * affB;
      return scoreB - scoreA;
    });

    const target = candidates[0];
    target.load = Math.min(1, target.load + 0.05);  // simulate load increase
    this._routed++;
    this._log.push({ seq: msg.seq, from: msg.from, to: target.id, type: msg.type, ts: Date.now() });
    if (this._log.length > 200) this._log.shift();

    return { routed: true, target: target.id, msg: { ...msg, to: target.id } };
  }

  /** Broadcast to all alive nodes. */
  broadcast(type, payload = {}) {
    const msg = sovereignMessage(type, this.self.id, null, payload);
    const targets = this.aliveNodes().map(n => n.id);
    return { msg, targets };
  }

  pulse() {
    this._beat++;
    // Decay load on all nodes slightly each beat
    for (const n of this.nodes.values()) {
      n.load = Math.max(0, n.load - 0.02);
    }
    return {
      beat:      this._beat,
      coherence: this.coherence().toFixed(4),
      nodes:     this.aliveNodes().length,
      routed:    this._routed,
      dropped:   this._dropped,
    };
  }

  snapshot() {
    return {
      self:      this.self.toDict(),
      beat:      this._beat,
      coherence: this.coherence().toFixed(4),
      nodes:     Array.from(this.nodes.values()).map(n => n.toDict()),
      routed:    this._routed,
      dropped:   this._dropped,
    };
  }
}

module.exports = {
  SovereignFederation, SubstrateNode, sovereignMessage,
  SUBSTRATE, MSG_TYPE, PHI, PHI_INV, HEARTBEAT_MS,
};
