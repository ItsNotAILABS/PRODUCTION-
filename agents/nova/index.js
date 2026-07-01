'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT_MS = 873;
const HEARTBEAT_S = HEARTBEAT_MS / 1000;
const NODE_COUNT = 96;
const COHERENCE_TARGET = 0.87;

// 24 neurochemicals — mirrors neurocore-idl.js and organism/python/organism/neuroemergence.py
const NEUROCHEMICALS = [
  'dopamine','serotonin','norepinephrine','acetylcholine','gaba',
  'glutamate','oxytocin','cortisol','melatonin','adenosine',
  'anandamide','substance_p','neuropeptide_y','endorphin','enkephalin',
  'dynorphin','crf','vasopressin','bdnf','ngf',
  'il6','tnf_alpha','nitric_oxide','histamine',
];

// 4 training protocols — matches PROTOCOL_IDS in neurocore-idl.js
const PROTOCOL_IDS = {
  AI_INTELLIGENCE: 0,
  MILITARY: 1,
  RESEARCH: 2,
  COMMERCIALIZATION: 3,
};

// Coupling bias per protocol — distinct training emphases on connectome synchrony
const COUPLING_BIAS = { 0: 1.05, 1: 0.95, 2: 1.0, 3: 1.02 };

function orderParameter(phases) {
  let sumCos = 0, sumSin = 0;
  const n = phases.length;
  for (const theta of phases) { sumCos += Math.cos(theta); sumSin += Math.sin(theta); }
  const r = Math.hypot(sumCos / n, sumSin / n);
  const psi = Math.atan2(sumSin / n, sumCos / n);
  return { r, psi };
}

function meanFieldStep(phases, activities, coupling, dt) {
  const { r, psi } = orderParameter(phases);
  return phases.map((theta, i) => {
    let next = theta + coupling * r * Math.sin(psi - theta) * dt * activities[i];
    next = next % (2 * Math.PI);
    if (next < 0) next += 2 * Math.PI;
    return next;
  });
}

function hillResponse(dose) {
  return dose / (dose + PHI);
}

class NovaAgent {
  constructor(nodeCount = NODE_COUNT, seed = null) {
    this.id = 'NOVA';
    this.nodeCount = nodeCount;
    this._rng = seed !== null ? this._seededRng(seed) : Math.random.bind(Math);
    this._phases = Array.from({ length: nodeCount }, () => this._rng() * 2 * Math.PI);
    this._activities = new Array(nodeCount).fill(0.5);
    this._coupling = PHI_INV;
    this._chemicals = {};
    this._protocolRuns = {};
    this._beat = 0;
    this._syncBeats = 0;
    this._lastPulseAt = Date.now();

    for (const c of NEUROCHEMICALS) this._chemicals[c] = { level: 1.0, lastDoseAt: Date.now() };
    for (const id of Object.values(PROTOCOL_IDS)) this._protocolRuns[id] = 0;
  }

  _seededRng(seed) {
    let s = seed | 0;
    return () => {
      s = Math.imul(s ^ (s >>> 15), 0x85ebca77);
      s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
      s ^= s >>> 16;
      return ((s >>> 0) / 0xFFFFFFFF);
    };
  }

  _decayChemicals() {
    const now = Date.now();
    for (const name of NEUROCHEMICALS) {
      const c = this._chemicals[name];
      const ageS = (now - c.lastDoseAt) / 1000;
      const halfLife = 137.508; // golden-angle seconds, matches organism.resonance phi_decay
      c.level = Math.max(0, c.level * Math.pow(0.5, ageS / halfLife));
    }
  }

  pulse() {
    this._decayChemicals();
    this._phases = meanFieldStep(this._phases, this._activities, this._coupling, HEARTBEAT_S);
    const { r, psi } = orderParameter(this._phases);
    this._beat++;
    if (r >= COHERENCE_TARGET) this._syncBeats++;
    this._lastPulseAt = Date.now();
    return { r, psi, beat: this._beat };
  }

  inject(chemical, dose) {
    if (!NEUROCHEMICALS.includes(chemical)) throw new Error(`Unknown chemical: ${chemical}`);
    if (dose <= 0 || dose > 100) throw new Error('Dose must be in range (0, 100]');
    const response = hillResponse(dose);
    const c = this._chemicals[chemical];
    const newLevel = c.level + response;
    c.level = newLevel;
    c.lastDoseAt = Date.now();
    return { chemical, dose, response, newLevel };
  }

  getCoherence() {
    return orderParameter(this._phases).r;
  }

  // Attention mode from coherence: high R = focused, low = exploratory
  focus(task = '') {
    const r = this.getCoherence();
    const mode = r >= COHERENCE_TARGET
      ? 'FOCUSED'
      : r >= 0.5
        ? 'CONVERGING'
        : 'EXPLORATORY';
    return { coherence: +r.toFixed(4), mode, task };
  }

  runProtocol(name, ticks = 50) {
    const id = PROTOCOL_IDS[name.toUpperCase()];
    if (id === undefined) throw new Error(`Unknown protocol: ${name}. Valid: ${Object.keys(PROTOCOL_IDS).join(', ')}`);
    const bias = COUPLING_BIAS[id] || 1.0;
    this._coupling = Math.min(1.0, this._coupling * bias);
    for (let i = 0; i < ticks; i++) this.pulse();
    this._protocolRuns[id] = (this._protocolRuns[id] || 0) + 1;
    return { protocol: name, ticks, coherence: +this.getCoherence().toFixed(4), runs: this._protocolRuns[id] };
  }

  snapshot() {
    const r = this.getCoherence();
    const syncRatio = this._beat > 0 ? this._syncBeats / this._beat : 0;
    return {
      coherence: +r.toFixed(4),
      target: COHERENCE_TARGET,
      passing: r >= COHERENCE_TARGET,
      beat: this._beat,
      syncRatio: +syncRatio.toFixed(4),
      coupling: +this._coupling.toFixed(6),
      neurochemicals: Object.fromEntries(
        NEUROCHEMICALS.map(c => [c, +this._chemicals[c].level.toFixed(4)])
      ),
      protocolRuns: { ...this._protocolRuns },
    };
  }

  status() {
    return { id: this.id, nodeCount: this.nodeCount, coherence: +this.getCoherence().toFixed(4), beat: this._beat };
  }
}

module.exports = { NovaAgent, NEUROCHEMICALS, PROTOCOL_IDS };
