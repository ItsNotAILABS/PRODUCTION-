/**
 * PROTO-FED-001: Agent Federation Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Sovereign mesh federation for organism agents.
 * Agents discover peers, negotiate ring assignments, delegate tasks,
 * and form dynamic coalitions — all without a central broker.
 *
 * Federation model:
 *   - Peers announce themselves with a signed capability manifest
 *   - Routing uses phi-weighted ring affinity (closer ring = preferred peer)
 *   - Task delegation follows the Kuramoto coherence gate: only delegate
 *     when the mesh R >= phi_inv (0.618)
 *   - Failed delegations decay the peer's phi-score; successes amplify it
 */

'use strict';

const PHI      = 1.618033988749895;
const PHI_INV  = 0.618033988749895;
const HEARTBEAT = 873;

const RING_ORDER = [
  'SovereignRing', 'SovereignEdgeRing', 'CognitiveRing', 'NeuralRing',
  'MemoryRing', 'RouteRing', 'AffectiveRing', 'SomaticRing',
  'QuantumRing', 'TemporalRing', 'InterfaceRing',
];

function ringDistance(a, b) {
  const ai = RING_ORDER.indexOf(a), bi = RING_ORDER.indexOf(b);
  return Math.abs(ai - bi);
}

function ringAffinity(a, b) {
  return Math.pow(PHI, -ringDistance(a, b));
}

class FederationMesh {
  constructor(selfId, selfRing) {
    this.selfId   = selfId;
    this.selfRing = selfRing;
    this.peers    = new Map();   // peerId → PeerRecord
    this.pending  = [];          // outbound delegation queue
    this._beat    = 0;
  }

  /**
   * Register a peer agent with its capability manifest.
   * @param {string} peerId
   * @param {string} ring         peer's ring affinity
   * @param {string[]} capabilities
   */
  addPeer(peerId, ring, capabilities = []) {
    this.peers.set(peerId, {
      peerId,
      ring,
      capabilities,
      phiScore:    1.0,
      lastSeen:    Date.now(),
      delegations: 0,
      successes:   0,
    });
  }

  removePeer(peerId) { this.peers.delete(peerId); }

  /** All live peers (seen within 3 heartbeats). */
  livePeers() {
    const cutoff = Date.now() - HEARTBEAT * 3;
    return Array.from(this.peers.values()).filter(p => p.lastSeen > cutoff);
  }

  /** Mesh coherence R = live/total. */
  coherence() {
    if (this.peers.size === 0) return 0;
    return this.livePeers().length / this.peers.size;
  }

  /**
   * Find best peer for a task based on capability match + ring affinity.
   * @param {string[]} requiredCaps
   * @param {string}   preferredRing
   * @returns {PeerRecord|null}
   */
  bestPeer(requiredCaps = [], preferredRing = this.selfRing) {
    const live = this.livePeers().filter(p =>
      requiredCaps.every(c => p.capabilities.includes(c))
    );
    if (live.length === 0) return null;
    live.sort((a, b) => {
      const sa = a.phiScore * ringAffinity(preferredRing, a.ring);
      const sb = b.phiScore * ringAffinity(preferredRing, b.ring);
      return sb - sa;
    });
    return live[0];
  }

  /**
   * Delegate a task to a peer if the mesh is coherent.
   * @param {Object} task  { id, type, payload, requiredCaps }
   * @returns {{ delegated: bool, peer: string|null, reason: string }}
   */
  delegate(task) {
    if (this.coherence() < PHI_INV) {
      return { delegated: false, peer: null, reason: 'mesh_incoherent' };
    }
    const peer = this.bestPeer(task.requiredCaps || [], task.preferredRing);
    if (!peer) {
      return { delegated: false, peer: null, reason: 'no_capable_peer' };
    }
    peer.delegations++;
    this.pending.push({ task, peerId: peer.peerId, ts: Date.now() });
    return { delegated: true, peer: peer.peerId, reason: 'ok' };
  }

  /** Record outcome of a delegated task (updates peer phi-score). */
  recordOutcome(peerId, success) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (success) {
      peer.successes++;
      peer.phiScore = Math.min(PHI, peer.phiScore * PHI);
    } else {
      peer.phiScore = Math.max(0.01, peer.phiScore * PHI_INV);
    }
  }

  /** Tick the heartbeat. */
  pulse() {
    this._beat++;
    return { beat: this._beat, coherence: this.coherence(), peers: this.livePeers().length };
  }

  snapshot() {
    return {
      selfId:    this.selfId,
      selfRing:  this.selfRing,
      beat:      this._beat,
      coherence: this.coherence(),
      peers:     Array.from(this.peers.values()).map(p => ({
        peerId:       p.peerId,
        ring:         p.ring,
        phiScore:     p.phiScore.toFixed(4),
        capabilities: p.capabilities,
        delegations:  p.delegations,
        successes:    p.successes,
      })),
    };
  }
}

module.exports = { FederationMesh, ringAffinity, ringDistance, RING_ORDER, PHI, PHI_INV };
