/**
 * PROTO-AI-001: AI Evaluation Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Standardised evaluation harness for AI model outputs and agent runs.
 * Used by AI development teams to benchmark, score, and route to the
 * best model for each task type.
 *
 * Scoring uses the phi-weighted rubric:
 *   overall = accuracy * phi^3 + coherence * phi^2 + latency_score * phi + cost_score
 *   (normalised to [0,1])
 *
 * Supports: LLM eval, agent capability testing, RAG retrieval quality,
 * tool-call accuracy, multimodal output quality, code correctness.
 */

'use strict';

const PHI     = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const EVAL_TYPE = Object.freeze({
  ACCURACY:    'accuracy',
  COHERENCE:   'coherence',
  CODE_CORRECT:'code_correctness',
  TOOL_USE:    'tool_use',
  RETRIEVAL:   'retrieval',
  LATENCY:     'latency',
  COST:        'cost',
  MULTIMODAL:  'multimodal',
  AGENT_GOAL:  'agent_goal',
});

const DIMENSION_WEIGHT = {
  [EVAL_TYPE.ACCURACY]:     PHI ** 3,
  [EVAL_TYPE.COHERENCE]:    PHI ** 2,
  [EVAL_TYPE.CODE_CORRECT]: PHI ** 2,
  [EVAL_TYPE.AGENT_GOAL]:   PHI ** 3,
  [EVAL_TYPE.TOOL_USE]:     PHI,
  [EVAL_TYPE.RETRIEVAL]:    PHI,
  [EVAL_TYPE.MULTIMODAL]:   PHI,
  [EVAL_TYPE.LATENCY]:      1,
  [EVAL_TYPE.COST]:         1,
};

class EvalResult {
  constructor({ modelId, taskId, dimensions = {} }) {
    this.modelId    = modelId;
    this.taskId     = taskId;
    this.dimensions = dimensions;   // { EVAL_TYPE: score ∈ [0,1] }
    this.phiScore   = this._compute();
    this.createdAt  = Date.now();
  }

  _compute() {
    let num = 0, den = 0;
    for (const [dim, score] of Object.entries(this.dimensions)) {
      const w = DIMENSION_WEIGHT[dim] || 1;
      num += score * w;
      den += w;
    }
    return den > 0 ? Math.min(1, num / den / PHI) : 0;   // PHI normalise to [0,1]
  }

  toDict() {
    return {
      modelId:    this.modelId,
      taskId:     this.taskId,
      phiScore:   parseFloat(this.phiScore.toFixed(4)),
      dimensions: Object.fromEntries(
        Object.entries(this.dimensions).map(([k,v]) => [k, parseFloat(v.toFixed(4))])
      ),
    };
  }
}

class ModelEvaluator {
  constructor() {
    this._results = [];    // EvalResult[]
    this._beat    = 0;
  }

  /**
   * Record an evaluation result.
   * @param {string}  modelId
   * @param {string}  taskId
   * @param {Object}  dimensions  { [EVAL_TYPE]: score }
   */
  record(modelId, taskId, dimensions) {
    const result = new EvalResult({ modelId, taskId, dimensions });
    this._results.push(result);
    this._beat++;
    return result;
  }

  /**
   * Return model rankings by average phi-score across all eval runs.
   */
  rankings() {
    const byModel = {};
    for (const r of this._results) {
      if (!byModel[r.modelId]) byModel[r.modelId] = [];
      byModel[r.modelId].push(r.phiScore);
    }
    return Object.entries(byModel)
      .map(([modelId, scores]) => ({
        modelId,
        avgPhiScore: parseFloat((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(4)),
        runs: scores.length,
      }))
      .sort((a,b) => b.avgPhiScore - a.avgPhiScore);
  }

  /**
   * Best model for a specific eval dimension.
   */
  bestFor(dimension) {
    const byModel = {};
    for (const r of this._results) {
      const score = r.dimensions[dimension];
      if (score === undefined) continue;
      if (!byModel[r.modelId]) byModel[r.modelId] = [];
      byModel[r.modelId].push(score);
    }
    let best = null, bestScore = -1;
    for (const [modelId, scores] of Object.entries(byModel)) {
      const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
      if (avg > bestScore) { bestScore = avg; best = modelId; }
    }
    return best ? { modelId: best, avgScore: parseFloat(bestScore.toFixed(4)) } : null;
  }

  /**
   * Phi-weighted consensus: given multiple outputs from different models,
   * rank by phi-score and return the top output.
   */
  selectBest(candidates) {
    if (!candidates.length) return null;
    return candidates
      .map(c => ({ ...c, _w: c.phiScore ?? 1 }))
      .sort((a,b) => b._w - a._w)[0];
  }

  pulse() { this._beat++; return { beat: this._beat, results: this._results.length }; }

  snapshot() {
    return {
      beat:     this._beat,
      results:  this._results.length,
      rankings: this.rankings(),
    };
  }
}

module.exports = { ModelEvaluator, EvalResult, EVAL_TYPE, DIMENSION_WEIGHT, PHI, PHI_INV };
