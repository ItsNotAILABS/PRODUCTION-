'use strict';

const path = require('path');
const { loadCsv } = require('../_lib/csv.js');

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

class NexusAgent {
  constructor() {
    this.id = 'NEXUS';
    this.protocols = [];
    this.scores = {};
    this.routingTable = {};
    this._boot();
  }

  _boot() {
    const rows = loadCsv(path.join(REPO_ROOT, 'AI_Protocols_Register.csv'));
    this.protocols = rows.filter(r => r.status === 'active');

    // Initial phi-weighted base score: lower protocol ordinal = higher base priority
    const n = this.protocols.length;
    this.protocols.forEach((p, i) => {
      this.scores[p.protocol_id] = Math.pow(PHI, -(i / n));
    });

    // Build ring-indexed routing table for fast lookups
    this.routingTable = {};
    for (const p of this.protocols) {
      const ring = p.ring_affinity || 'Unclassified';
      if (!this.routingTable[ring]) this.routingTable[ring] = [];
      this.routingTable[ring].push(p);
    }
  }

  // Route a task to the best-matching protocol.
  // task: { ring?, intelligenceClass?, type?, keyword? }
  route(task = {}) {
    const ring = (task.ring || '').toLowerCase();
    const cls  = (task.intelligenceClass || '').toLowerCase();
    const kw   = (task.keyword || '').toLowerCase();

    const scored = this.protocols.map(p => {
      let score = this.scores[p.protocol_id] || 1.0;
      if (ring && p.ring_affinity && p.ring_affinity.toLowerCase().includes(ring))
        score *= PHI * PHI;
      if (cls && p.intelligence_class && p.intelligence_class.toLowerCase().includes(cls))
        score *= PHI;
      if (kw) {
        const haystack = [p.protocol_name, p.primary_function, p.intelligence_class].join(' ').toLowerCase();
        if (haystack.includes(kw)) score *= PHI;
      }
      return { ...p, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);
    return scored[0] || null;
  }

  getTopRoutes(task = {}, n = 5) {
    const ring = (task.ring || '').toLowerCase();
    const cls  = (task.intelligenceClass || '').toLowerCase();
    const kw   = (task.keyword || '').toLowerCase();

    const scored = this.protocols.map(p => {
      let score = this.scores[p.protocol_id] || 1.0;
      if (ring && p.ring_affinity && p.ring_affinity.toLowerCase().includes(ring)) score *= PHI * PHI;
      if (cls && p.intelligence_class && p.intelligence_class.toLowerCase().includes(cls)) score *= PHI;
      if (kw) {
        const haystack = [p.protocol_name, p.primary_function, p.intelligence_class].join(' ').toLowerCase();
        if (haystack.includes(kw)) score *= PHI;
      }
      return { ...p, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, n);
  }

  // Adaptive phi-decay feedback: success amplifies score, failure decays it
  registerOutcome(protocolId, success) {
    const prior = this.scores[protocolId] || 1.0;
    this.scores[protocolId] = success
      ? Math.min(Math.pow(PHI, 3), prior * PHI)
      : Math.max(Math.pow(PHI, -3), prior * PHI_INV);
  }

  getRoutingTable() {
    return this.routingTable;
  }

  status() {
    return {
      id: this.id,
      activeProtocols: this.protocols.length,
      rings: Object.keys(this.routingTable),
    };
  }
}

module.exports = { NexusAgent };
