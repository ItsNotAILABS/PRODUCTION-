"use strict";
/**
 * Adaptive Health Tracker — learning core.
 *
 * A scoped, honest implementation of the feedback-loop/homeostasis/
 * governance ideas from FreddyCreates/sovereign's ADAPTIVE_INTELLIGENCE_
 * IMPLEMENTATION.md (ANIMUS), redesigned around real signals this repo
 * actually has: CI job outcomes, CodeQL alert counts, dependency staleness.
 * See ../README.md for the concept-by-concept mapping and what's a real
 * algorithm here vs. what's a metaphor carried over in naming only.
 *
 * Every function below is pure (state in, state out) so it's directly
 * testable without touching the GitHub API — see ../tests/learn.test.js.
 */

const MIN_LEARNING_RATE = 0.01; // governance: learning can never fully stop...
const MAX_LEARNING_RATE = 0.5; //  ...or run away unbounded
const DEFAULT_LEARNING_RATE = 0.15;
const HISTORY_CAP = 50; // real sliding window, sized to how many CI runs actually exist (not the 1000 the source doc used for a differently-scaled system)
const HOMEOSTASIS_WINDOW = 10; // how many recent outcomes decide explore vs exploit
const HOMEOSTASIS_ERROR_THRESHOLD = 0.618 * 0.3; // keeps the source doc's constant for continuity; not treated as meaningful beyond "a threshold we picked"

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** A fresh per-signal state before any observations have been folded in. */
function initSignalState() {
  return {
    prediction: 0.5,
    weight: 0.5,
    learningRate: DEFAULT_LEARNING_RATE,
    history: [],
  };
}

/**
 * Fold one new observed outcome (0..1, where 1 = healthy) into a signal's
 * state. This is the "feedback loop" from the source doc: outcome measurement
 * feeds back as a learning signal that updates the tracked state.
 *
 * - `prediction` moves toward the outcome by an error-correction step — a
 *   real (if simple) TD-learning-style update, not a metaphor.
 * - `weight` updates via a Hebbian-style co-activation term: it strengthens
 *   when the error and the outcome move together, i.e. when this signal is
 *   currently informative.
 * - `learningRate` is adjusted by `applyHomeostasis` below, bounded by the
 *   governance constants above.
 */
function updateSignal(state, outcome, now = new Date()) {
  const s = state ?? initSignalState();
  const error = outcome - s.prediction;

  const nextPrediction = clamp(s.prediction + s.learningRate * error, 0, 1);
  const nextWeight = clamp(s.weight + s.learningRate * error * outcome, 0, 1);

  const history = [...s.history, { outcome, error, at: now.toISOString() }].slice(-HISTORY_CAP);

  const withHistory = {
    prediction: nextPrediction,
    weight: nextWeight,
    learningRate: s.learningRate,
    history,
  };

  return applyHomeostasis(withHistory);
}

/**
 * Homeostasis: when a signal has been consistently surprising (large recent
 * prediction error), raise its learning rate to adapt faster — explore. When
 * it's been stable, lower the learning rate — exploit/settle. This is the
 * "prediction error coupled to explore/exploit oscillation" concept from the
 * source doc, minus the doc's language about "awareness levels."
 */
function applyHomeostasis(state) {
  const recent = state.history.slice(-HOMEOSTASIS_WINDOW);
  if (recent.length === 0) return state;

  const avgAbsError = recent.reduce((sum, h) => sum + Math.abs(h.error), 0) / recent.length;
  const direction = avgAbsError > HOMEOSTASIS_ERROR_THRESHOLD ? 1.1 : 0.95;
  const learningRate = clamp(state.learningRate * direction, MIN_LEARNING_RATE, MAX_LEARNING_RATE);

  return { ...state, learningRate };
}

/**
 * "Novelty detector": given this update cycle's per-signal states, name the
 * signal with the largest most-recent absolute error — the one behaving
 * least predictably right now.
 */
function detectNovelty(signals) {
  let noveltyKey = null;
  let maxAbsError = -Infinity;

  for (const [key, state] of Object.entries(signals)) {
    const last = state.history[state.history.length - 1];
    if (!last) continue;
    const absError = Math.abs(last.error);
    if (absError > maxAbsError) {
      maxAbsError = absError;
      noveltyKey = key;
    }
  }

  return noveltyKey === null ? null : { signal: noveltyKey, absError: maxAbsError };
}

/**
 * "Observable state registry" + learning-velocity tracking: a single scalar
 * summarizing how much the whole system moved this cycle (mean absolute
 * error across all signals), appended to a bounded top-level history.
 */
function computeLearningVelocity(signals) {
  const errors = Object.values(signals)
    .map((s) => s.history[s.history.length - 1]?.error)
    .filter((e) => e !== undefined)
    .map(Math.abs);
  if (errors.length === 0) return 0;
  return errors.reduce((a, b) => a + b, 0) / errors.length;
}

module.exports = {
  MIN_LEARNING_RATE,
  MAX_LEARNING_RATE,
  DEFAULT_LEARNING_RATE,
  HISTORY_CAP,
  clamp,
  initSignalState,
  updateSignal,
  applyHomeostasis,
  detectNovelty,
  computeLearningVelocity,
};
