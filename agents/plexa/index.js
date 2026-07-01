'use strict';

const path = require('path');
const { loadCsv } = require('../_lib/csv.js');

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Priority tiers from register: P0 = frontier alpha, P1 = sovereign, P2 = specialist
const PRIORITY_SCORE = { 'P0': PHI * PHI, 'P1': PHI, 'P2': 1.0 };

function extractPriority(routingPriority) {
  const m = (routingPriority || '').match(/P(\d)/);
  return m ? `P${m[1]}` : 'P2';
}

function tokenOverlap(text, keywords) {
  const t = text.toLowerCase();
  return keywords.filter(k => t.includes(k.toLowerCase())).length / Math.max(1, keywords.length);
}

class PlexaAgent {
  constructor() {
    this.id = 'PLEXA';
    this.models = [];
    this.capabilityMatrix = {};
    this._boot();
  }

  _boot() {
    const modelFile = path.join(REPO_ROOT, 'AI_Model_Families_Register.csv');
    const multiFile = path.join(REPO_ROOT, 'Multimodal_Families_Register.csv');

    let rows = [];
    try { rows = rows.concat(loadCsv(modelFile)); } catch {}
    try { rows = rows.concat(loadCsv(multiFile)); } catch {}

    this.models = rows.filter(r => r.engine_status === 'active' || r.status === 'active' || !r.engine_status);

    // Build capability matrix: map capability class -> model list
    for (const m of this.models) {
      const caps = [m.primary_capability, ...(m.secondary_capabilities || '').split('/')].map(c => (c || '').trim()).filter(Boolean);
      for (const cap of caps) {
        if (!this.capabilityMatrix[cap]) this.capabilityMatrix[cap] = [];
        this.capabilityMatrix[cap].push(m.family_id || m.family_name);
      }
    }
  }

  recommend(task = {}) {
    const taskText = typeof task === 'string' ? task : (task.text || task.type || '');
    const keywords = taskText.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = this.models.map(m => {
      const caps = [m.primary_capability, m.secondary_capabilities, m.intelligence_class, m.modality].join(' ');
      const overlap = tokenOverlap(caps, keywords);
      const pScore = PRIORITY_SCORE[extractPriority(m.routing_priority)] || 1.0;
      return { ...m, _score: overlap * pScore * PHI };
    });

    scored.sort((a, b) => b._score - a._score);
    const top = scored[0] || null;
    return top ? {
      familyId: top.family_id,
      name: top.family_name || top.family_id,
      alphaModel: top.alpha_model,
      primaryCapability: top.primary_capability,
      modality: top.modality,
      contextWindow: top.context_window,
      score: +top._score.toFixed(4),
    } : null;
  }

  rank(taskType, topN = 5) {
    const keywords = (taskType || '').toLowerCase().split(/[\s\/]+/).filter(t => t.length > 2);
    const scored = this.models.map(m => {
      const text = [m.primary_capability, m.secondary_capabilities, m.intelligence_class].join(' ');
      const overlap = tokenOverlap(text, keywords);
      const pScore = PRIORITY_SCORE[extractPriority(m.routing_priority)] || 1.0;
      return {
        id: m.family_id,
        name: m.family_name,
        model: m.alpha_model,
        capability: m.primary_capability,
        score: +(overlap * pScore * PHI).toFixed(4),
      };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).filter(r => r.score > 0);
  }

  // Phi-decay weighted consensus over an array of text outputs (without external APIs).
  // Weights default to descending phi powers: w_i = PHI^(-i), normalized.
  fuse(outputs = [], weights = null) {
    if (!outputs.length) return { result: null, confidence: 0 };
    const w = weights
      ? weights.slice(0, outputs.length)
      : outputs.map((_, i) => Math.pow(PHI_INV, i));
    const wSum = w.reduce((s, x) => s + x, 0);
    const normalized = w.map(x => x / wSum);

    // Token-level consensus: pick the output whose tokens appear most in other outputs
    const allTokens = outputs.map(o =>
      o.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1)
    );
    const scores = outputs.map((_, i) => {
      const tokens = allTokens[i];
      let overlap = 0;
      for (let j = 0; j < outputs.length; j++) {
        if (i === j) continue;
        overlap += tokens.filter(t => allTokens[j].includes(t)).length / Math.max(1, tokens.length);
      }
      return overlap * normalized[i];
    });

    const bestIdx = scores.indexOf(Math.max(...scores));
    const confidence = scores[bestIdx] / Math.max(1, outputs.length - 1);

    return {
      result: outputs[bestIdx],
      confidence: +confidence.toFixed(4),
      weights: normalized.map(n => +n.toFixed(4)),
      consensusIndex: bestIdx,
    };
  }

  getCapabilityMatrix() {
    return this.capabilityMatrix;
  }

  status() {
    return {
      id: this.id,
      models: this.models.length,
      capabilityClasses: Object.keys(this.capabilityMatrix).length,
    };
  }
}

module.exports = { PlexaAgent };
