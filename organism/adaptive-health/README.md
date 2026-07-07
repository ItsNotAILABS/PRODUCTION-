# Adaptive Health Tracker

A scoped, working implementation of the core ideas in
[`FreddyCreates/sovereign`'s `ADAPTIVE_INTELLIGENCE_IMPLEMENTATION.md`](https://github.com/FreddyCreates/sovereign/blob/main/ADAPTIVE_INTELLIGENCE_IMPLEMENTATION.md)
(ANIMUS), redesigned around real signals this repository actually produces —
CI outcomes, CodeQL findings, dependency staleness — rather than a literal
port of that document's Motoko/"mind embedding" implementation, which is
built for a different system entirely.

**What this honestly is**: a small, real error-correction learning loop (the
same family as exponential moving averages / simple TD-learning), with a
homeostatic rule that speeds up or slows down adaptation based on how
surprising recent outcomes have been, bounded by fixed governance limits. Not
a consciousness or a neural network — the source document's language is
kept where it accurately describes the mechanism, and dropped where it
doesn't.

## Concept-by-concept mapping

| ANIMUS concept | What's actually implemented here |
|---|---|
| Feedback loop integration (outcome → embedding update via Hebbian rules) | `lib/learn.js#updateSignal` — a real error-correction update: `prediction += learningRate × (outcome − prediction)`, plus a Hebbian-style co-activation term on `weight`. The "embedding" is one scalar prediction + one scalar weight per signal, not an 8-dimensional vector — there's no basis for a higher-dimensional state here yet. |
| Homeostasis engine (prediction error ↔ explore/exploit) | `lib/learn.js#applyHomeostasis` — when recent average absolute error exceeds a threshold, `learningRate` rises (explore); when error is low, it decays (exploit). Verified in `tests/learn.test.js` to actually produce this explore-then-settle curve, not just assert it exists. |
| Governance rules (constraints on learning speed) | `MIN_LEARNING_RATE` / `MAX_LEARNING_RATE` in `lib/learn.js` — hard clamps `applyHomeostasis` can never exceed, tested directly. |
| Novelty detector | `lib/learn.js#detectNovelty` — names the signal with the largest most-recent prediction error each cycle. Visualized in `dashboard.html`'s stat tile. |
| Observable state registry | `state.json`, committed by the scheduled bot on every run — the full per-signal history (bounded to the last 50 observations) plus a velocity-over-time log. `dashboard.html` renders it. |
| Predictive error computation | Every signal's `error` is a real measured value: `outcome − prediction`, where `outcome` comes from an actual GitHub API call (`lib/signals.js`), not a simulated mismatch count. |
| Meta-learning ("learning about learning rates") | Partially implemented: `applyHomeostasis` adapts the learning rate itself based on outcome volatility. What's *not* implemented: learning the homeostasis threshold or the governance bounds themselves — those are fixed constants. A genuine meta-learning layer on top of those would be a reasonable next step, not attempted here to keep this auditable. |
| Advanced Hebbian rules (STDP) | Not implemented. STDP is inherently about relative *timing* between spikes in a neural system; there's no analogous "spike timing" in CI outcome data, so porting it here would be decorative rather than functional. Flagging this explicitly rather than faking it. |
| Embedding drift analysis | Not implemented, for the same reason as the 8-dimensional embedding above — there's currently only one scalar per signal, so "drift" would just be restating the error history already tracked. Worth building once/if signals become multi-dimensional. |

## What real signals feed this

- `ci:<job-name>` — one per job in `weekly-command-center-ci.yml`'s most
  recent completed run (1 = passed, 0 = anything else).
- `codeql_findings` — derived from open CodeQL alert count on this repo
  (`weekly-command-center-codeql.yml`'s output).
- `dependency_freshness` — derived from how many Dependabot PRs are
  currently open and unmerged.

All fetched live from the GitHub API in `lib/signals.js` — nothing here is
hardcoded or simulated. A signal that can't be measured (e.g. code scanning
not yet enabled) is simply omitted from that cycle rather than faked.

## Running it

```sh
cd organism/adaptive-health
node --test                  # the learning core is pure functions, fully unit-tested
node update-state.js         # requires GITHUB_REPOSITORY_OWNER, GITHUB_REPOSITORY, GITHUB_TOKEN env vars
```

`dashboard.html` reads `./state.json` — serve the directory over HTTP (e.g.
`npx serve .`) rather than opening the file directly, since browsers block
`fetch` on `file://` URLs.

In production this runs on a schedule via
`.github/workflows/organism-adaptive-health-bot.yml`, which commits the
updated `state.json` — see that workflow for the cadence and commit
conventions (it follows `.github/AGENT_BOUNDARIES.md`'s rules for bot
commits: `[skip ci]`, a concurrency group, rebase-before-push).
