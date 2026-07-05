'use strict';

const path = require('path');
const { loadCsv } = require('../_lib/csv.js');

const PHI = 1.618033988749895;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let _multimodalProtocol, _evalProtocol;
try { _multimodalProtocol = require('../../protocols/multimodal-synthesis-protocol.js'); } catch {}
try { _evalProtocol       = require('../../protocols/ai-evaluation-protocol.js'); } catch {}

const REGISTERS = [
  { file: 'AI_Protocols_Register.csv',       label: 'protocol',     textFields: ['protocol_name','primary_function','intelligence_class','secondary_functions'] },
  { file: 'AI_Model_Families_Register.csv',  label: 'model',        textFields: ['family_name','primary_capability','secondary_capabilities','intelligence_class'] },
  { file: 'AI_Extensions_Register.csv',      label: 'extension',    textFields: ['extension_name','description','category','primary_use_case'] },
  { file: 'Architectural_Laws_Register.csv', label: 'law',          textFields: ['law_name','statement','primitive_function','domain'] },
  { file: 'Organism_Marketplace_Register.csv',label: 'marketplace', textFields: ['item_name','description','category','tags'] },
];

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function buildTfVector(tokens) {
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  return freq;
}

function cosineSim(a, b) {
  let dot = 0, normA = 0, normB = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const av = a[k] || 0, bv = b[k] || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class PythiaAgent {
  constructor() {
    this.id = 'PYTHIA';
    this.docs = [];
    this.idf = {};
    this._boot();
  }

  _boot() {
    for (const reg of REGISTERS) {
      const filePath = path.join(REPO_ROOT, reg.file);
      let rows;
      try { rows = loadCsv(filePath); } catch { continue; }
      for (const row of rows) {
        const text = reg.textFields.map(f => row[f] || '').join(' ');
        const tokens = tokenize(text);
        if (tokens.length < 2) continue;
        const tf = buildTfVector(tokens);
        this.docs.push({ label: reg.label, text, tokens, tf, row });
      }
    }
    this._buildIdf();
  }

  _buildIdf() {
    const N = this.docs.length;
    const df = {};
    for (const doc of this.docs) {
      for (const t of Object.keys(doc.tf)) {
        df[t] = (df[t] || 0) + 1;
      }
    }
    for (const t in df) {
      this.idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1;
    }
  }

  _tfidfVector(tf) {
    const vec = {};
    for (const t in tf) {
      vec[t] = tf[t] * (this.idf[t] || 1);
    }
    return vec;
  }

  absorb(text, source = 'dynamic') {
    const tokens = tokenize(text);
    const tf = buildTfVector(tokens);
    this.docs.push({ label: source, text, tokens, tf, row: {} });
    this._buildIdf();
  }

  query(text, topK = 7) {
    const qTokens = tokenize(text);
    const qTf = buildTfVector(qTokens);
    const qVec = this._tfidfVector(qTf);

    const scored = this.docs.map(doc => ({
      label: doc.label,
      text: doc.text.slice(0, 120),
      row: doc.row,
      score: cosineSim(qVec, this._tfidfVector(doc.tf)),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter(r => r.score > 0);
  }

  synthesize(text) {
    const results = this.query(text, 20);
    const byLabel = {};
    for (const r of results) {
      if (!byLabel[r.label]) byLabel[r.label] = [];
      byLabel[r.label].push(r);
    }
    return {
      query: text,
      totalDocs: this.docs.length,
      summary: Object.entries(byLabel).map(([label, items]) => ({
        label,
        topMatch: items[0]?.row,
        count: items.length,
        avgScore: +(items.reduce((s, i) => s + i.score, 0) / items.length).toFixed(4),
      })),
    };
  }

  getCorpusStats() {
    const byLabel = {};
    for (const doc of this.docs) byLabel[doc.label] = (byLabel[doc.label] || 0) + 1;
    return { totalDocs: this.docs.length, vocabularySize: Object.keys(this.idf).length, byLabel };
  }

  /**
   * Fuse multimodal inputs (text, code, data, etc.) using the synthesis protocol.
   * inputs: [{ modality: MODALITY.TEXT, content: '...', weight?: 1.0 }, ...]
   */
  fuseModalities(inputs = []) {
    if (!_multimodalProtocol) return { ok: false, error: 'multimodal-synthesis-protocol not loaded' };
    const { MultimodalSynthesizer } = _multimodalProtocol;
    if (!this._synthesizer) this._synthesizer = new MultimodalSynthesizer();
    return this._synthesizer.fuse(inputs);
  }

  /**
   * Record an AI model evaluation result.
   * dimensions: { accuracy: 0.9, coherence: 0.85, ... }
   */
  recordEval(modelId, taskId, dimensions) {
    if (!_evalProtocol) return { ok: false, error: 'ai-evaluation-protocol not loaded' };
    const { ModelEvaluator } = _evalProtocol;
    if (!this._evaluator) this._evaluator = new ModelEvaluator();
    return this._evaluator.record(modelId, taskId, dimensions);
  }

  /** Return the model rankings by phi-weighted average score. */
  modelRankings() {
    if (!this._evaluator) return [];
    return this._evaluator.rankings();
  }

  /** Return the best model for a specific evaluation dimension. */
  bestModel(dimension) {
    if (!this._evaluator) return null;
    return this._evaluator.bestFor(dimension);
  }

  status() {
    return {
      id: this.id,
      ...this.getCorpusStats(),
      multimodalLoaded: !!_multimodalProtocol,
      evalLoaded: !!_evalProtocol,
    };
  }
}

module.exports = { PythiaAgent };
