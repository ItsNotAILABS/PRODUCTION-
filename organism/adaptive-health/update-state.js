#!/usr/bin/env node
"use strict";
/**
 * Entrypoint run by .github/workflows/organism-adaptive-health-bot.yml.
 * Fetches real outcome signals, folds each into its tracked state via the
 * learning core, and writes the result back to state.json — the
 * "observable state registry" from the source doc, here just a committed
 * JSON file with real history in it.
 */
const fs = require("fs");
const path = require("path");

const { updateSignal, initSignalState, detectNovelty, computeLearningVelocity } = require("./lib/learn");
const { collectOutcomes } = require("./lib/signals");

const STATE_PATH = path.join(__dirname, "state.json");

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return { signals: {}, velocityHistory: [], lastUpdated: null };
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repo = (process.env.GITHUB_REPOSITORY || "").split("/")[1];
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error("GITHUB_REPOSITORY_OWNER, GITHUB_REPOSITORY, and GITHUB_TOKEN must be set");
  }

  const state = loadState();
  const outcomes = await collectOutcomes({ owner, repo, token });

  if (Object.keys(outcomes).length === 0) {
    console.log("No measurable signals this cycle (no completed CI runs yet?) — leaving state unchanged.");
    return;
  }

  const now = new Date();
  for (const [key, outcome] of Object.entries(outcomes)) {
    const prior = state.signals[key] ?? initSignalState();
    state.signals[key] = updateSignal(prior, outcome, now);
  }

  const novelty = detectNovelty(state.signals);
  const velocity = computeLearningVelocity(state.signals);

  state.velocityHistory = [...(state.velocityHistory ?? []), { velocity, novelty, at: now.toISOString() }].slice(-50);
  state.lastUpdated = now.toISOString();

  saveState(state);

  console.log(`Updated ${Object.keys(outcomes).length} signal(s). Learning velocity: ${velocity.toFixed(4)}.`);
  if (novelty) console.log(`Most novel signal this cycle: ${novelty.signal} (|error|=${novelty.absError.toFixed(4)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
