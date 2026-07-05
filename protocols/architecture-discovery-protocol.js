/**
 * PROTO-ARCH-001: Architecture Pattern Discovery
 * ═════════════════════════════════════════════════════════════════════
 *
 * Analyzes codebases for architectural patterns (layering, microservices,
 * event-driven, etc.) and recommends improvements based on coherence metrics.
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const PATTERN = Object.freeze({
  MONOLITH:        'monolith',
  LAYERED:         'layered',
  MICROSERVICES:   'microservices',
  EVENT_DRIVEN:    'event_driven',
  PIPELINE:        'pipeline',
  MODULAR:         'modular',
});

const METRIC = Object.freeze({
  COHESION:   'cohesion',     // internal module strength
  COUPLING:   'coupling',     // inter-module dependencies
  MODULARITY: 'modularity',   // how self-contained modules are
  SCALABILITY:'scalability',  // horizontal scaling readiness
});

class ArchitectureAnalyzer {
  constructor() {
    this.analysisHistory = [];
    this.patterns = {};
    this.recommendations = [];
  }

  analyzeStructure(modules = []) {
    if (modules.length === 0) return { ok: false, error: 'no_modules' };

    const analysis = {
      ts: Date.now(),
      moduleCount: modules.length,
      metrics: {},
      detectedPattern: null,
      scores: {},
    };

    const edges = {};
    for (const mod of modules) {
      edges[mod.id] = mod.dependencies || [];
    }

    analysis.metrics[METRIC.COUPLING] = this._computeCoupling(edges);
    analysis.metrics[METRIC.COHESION] = this._computeCohesion(modules);
    analysis.metrics[METRIC.MODULARITY] = this._computeModularity(modules, edges);
    analysis.metrics[METRIC.SCALABILITY] = this._computeScalability(modules);

    analysis.detectedPattern = this._detectPattern(analysis.metrics);
    analysis.scores = this._scoreMetrics(analysis.metrics);

    this.analysisHistory.push(analysis);
    if (this.analysisHistory.length > 50) this.analysisHistory.shift();

    this._generateRecommendations(analysis);

    return { ok: true, analysis };
  }

  _computeCoupling(edges) {
    const n = Object.keys(edges).length;
    if (n < 2) return 0;
    const totalEdges = Object.values(edges).reduce((s, deps) => s + deps.length, 0);
    return 1 - Math.min(1, totalEdges / (n * (n - 1)));
  }

  _computeCohesion(modules) {
    const sizes = modules.map(m => m.size || 1);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const variance = sizes.reduce((a, s) => a + (s - avgSize) ** 2, 0) / sizes.length;
    const normalizedVar = Math.sqrt(variance) / Math.max(1, avgSize);
    return Math.max(0, 1 - normalizedVar);
  }

  _computeModularity(modules, edges) {
    const internalDeps = modules.filter(m => {
      const outgoing = (edges[m.id] || []).length;
      const incoming = Object.values(edges).filter(deps => deps.includes(m.id)).length;
      return (outgoing + incoming) <= modules.length / 3;
    }).length;
    return internalDeps / Math.max(1, modules.length);
  }

  _computeScalability(modules) {
    const stateless = modules.filter(m => !m.hasState).length;
    const distributed = modules.filter(m => m.isDistributable).length;
    return (stateless + distributed) / (2 * Math.max(1, modules.length));
  }

  _detectPattern(metrics) {
    const c = metrics[METRIC.COUPLING];
    const m = metrics[METRIC.MODULARITY];
    const s = metrics[METRIC.SCALABILITY];

    if (m > 0.8 && s > 0.7) return PATTERN.MICROSERVICES;
    if (m > 0.6 && c > 0.7) return PATTERN.LAYERED;
    if (m > 0.5) return PATTERN.MODULAR;
    return PATTERN.MONOLITH;
  }

  _scoreMetrics(metrics) {
    const weighted = {
      [METRIC.COUPLING]: metrics[METRIC.COUPLING] * PHI_INV,
      [METRIC.COHESION]: metrics[METRIC.COHESION] * PHI,
      [METRIC.MODULARITY]: metrics[METRIC.MODULARITY] * PHI,
      [METRIC.SCALABILITY]: metrics[METRIC.SCALABILITY] * PHI_INV,
    };
    const sum = Object.values(weighted).reduce((a, b) => a + b, 0);
    return Object.fromEntries(
      Object.entries(weighted).map(([k, v]) => [k, +(v / 4).toFixed(4)])
    );
  }

  _generateRecommendations(analysis) {
    this.recommendations = [];
    const pattern = analysis.detectedPattern;
    const coupling = analysis.metrics[METRIC.COUPLING];
    const modularity = analysis.metrics[METRIC.MODULARITY];

    if (coupling > 0.7 && pattern === PATTERN.MONOLITH) {
      this.recommendations.push({
        severity: 'HIGH',
        issue: 'High coupling detected in monolithic structure',
        suggestion: 'Consider extracting modules into microservices',
        phi_improvement: PHI,
      });
    }

    if (modularity < 0.5) {
      this.recommendations.push({
        severity: 'MEDIUM',
        issue: 'Low modularity: modules are interdependent',
        suggestion: 'Define clear module boundaries and dependency graph',
        phi_improvement: PHI_INV,
      });
    }

    if (analysis.metrics[METRIC.SCALABILITY] < 0.6) {
      this.recommendations.push({
        severity: 'MEDIUM',
        issue: 'Low scalability: stateful or non-distributable modules',
        suggestion: 'Refactor stateful components into separate services',
        phi_improvement: PHI,
      });
    }
  }

  getRecommendations() {
    return this.recommendations;
  }

  snapshot() {
    return {
      lastAnalysis: this.analysisHistory[this.analysisHistory.length - 1] || null,
      analysisCount: this.analysisHistory.length,
      recommendations: this.recommendations,
    };
  }
}

module.exports = { ArchitectureAnalyzer, PATTERN, METRIC };
