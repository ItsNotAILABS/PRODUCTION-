"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  clamp,
  initSignalState,
  updateSignal,
  detectNovelty,
  computeLearningVelocity,
  MIN_LEARNING_RATE,
  MAX_LEARNING_RATE,
  DEFAULT_LEARNING_RATE,
  HISTORY_CAP,
} = require("../lib/learn");

test("clamp bounds values correctly", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test("initSignalState starts neutral", () => {
  const s = initSignalState();
  assert.equal(s.prediction, 0.5);
  assert.equal(s.weight, 0.5);
  assert.equal(s.learningRate, DEFAULT_LEARNING_RATE);
  assert.deepEqual(s.history, []);
});

test("repeated healthy outcomes converge prediction and weight toward 1", () => {
  let state = initSignalState();
  for (let i = 0; i < 30; i++) {
    state = updateSignal(state, 1, new Date(2026, 0, 1 + i));
  }
  assert.ok(state.prediction > 0.99, `expected prediction near 1, got ${state.prediction}`);
  assert.ok(state.weight > 0.99, `expected weight near 1, got ${state.weight}`);
});

test("repeated unhealthy outcomes converge prediction toward 0", () => {
  let state = initSignalState();
  for (let i = 0; i < 30; i++) {
    state = updateSignal(state, 0, new Date(2026, 0, 1 + i));
  }
  assert.ok(state.prediction < 0.01, `expected prediction near 0, got ${state.prediction}`);
});

test("learning rate never leaves its governance bounds, even under sustained volatility", () => {
  let state = initSignalState();
  for (let i = 0; i < 100; i++) {
    state = updateSignal(state, i % 2 === 0 ? 1 : 0, new Date(2026, 0, 1 + i));
  }
  assert.ok(state.learningRate >= MIN_LEARNING_RATE);
  assert.ok(state.learningRate <= MAX_LEARNING_RATE);
});

test("volatile signal raises learning rate above the default (homeostatic exploration)", () => {
  let state = initSignalState();
  for (let i = 0; i < 15; i++) {
    state = updateSignal(state, i % 2 === 0 ? 1 : 0, new Date(2026, 0, 1 + i));
  }
  assert.ok(state.learningRate > DEFAULT_LEARNING_RATE);
});

test("a signal settles: learning rate rises while still converging, then falls back below default once stable (homeostatic explore-then-exploit)", () => {
  let state = initSignalState();
  let peakLearningRate = state.learningRate;
  for (let i = 0; i < 60; i++) {
    state = updateSignal(state, 1, new Date(2026, 0, 1 + i));
    peakLearningRate = Math.max(peakLearningRate, state.learningRate);
  }
  // While prediction was still catching up to the outcome, error stayed
  // large enough to push learning rate above its starting point (explore).
  assert.ok(peakLearningRate > DEFAULT_LEARNING_RATE, `expected a peak above default, got ${peakLearningRate}`);
  // Once prediction has converged and stayed there, learning rate settles
  // back down below default (exploit).
  assert.ok(state.learningRate < DEFAULT_LEARNING_RATE, `expected settled rate below default, got ${state.learningRate}`);
});

test("history is capped at HISTORY_CAP entries", () => {
  let state = initSignalState();
  for (let i = 0; i < HISTORY_CAP + 25; i++) {
    state = updateSignal(state, 1, new Date(2026, 0, 1 + i));
  }
  assert.equal(state.history.length, HISTORY_CAP);
});

test("detectNovelty picks the signal with the largest most-recent absolute error", () => {
  const stable = updateSignal(initSignalState(), 1);
  const volatile = updateSignal(initSignalState(), 0); // error = 0 - 0.5 = -0.5, larger |error| than stable's 0.5... use a clearer contrast
  const veryVolatile = updateSignal(initSignalState(), 0);
  // Force distinguishable errors: stable starts near its own prediction, volatile starts far.
  const closeToPrediction = updateSignal({ ...initSignalState(), prediction: 0.9 }, 0.91);
  const farFromPrediction = updateSignal({ ...initSignalState(), prediction: 0.1 }, 0.95);

  const result = detectNovelty({ closeToPrediction, farFromPrediction });
  assert.equal(result.signal, "farFromPrediction");
});

test("detectNovelty returns null when no signal has history", () => {
  const result = detectNovelty({ a: initSignalState(), b: initSignalState() });
  assert.equal(result, null);
});

test("computeLearningVelocity averages the most recent absolute errors across signals", () => {
  const a = updateSignal({ ...initSignalState(), prediction: 0.5 }, 1); // |error| = 0.5
  const b = updateSignal({ ...initSignalState(), prediction: 0.5 }, 0); // |error| = 0.5
  assert.equal(computeLearningVelocity({ a, b }), 0.5);
});

test("computeLearningVelocity is 0 with no signals", () => {
  assert.equal(computeLearningVelocity({}), 0);
});
