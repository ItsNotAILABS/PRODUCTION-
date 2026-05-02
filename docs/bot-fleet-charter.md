# 🏛️ Organism Bot Fleet Charter

> The Sovereign Organism Bot Fleet — Operational Charter & Taxonomy

## Mission

The Organism Bot Fleet is a self-organizing automation ecosystem that builds, tests, secures, documents, deploys, learns from, and continuously improves the Sovereign Organism. Every bot is a real, wired automation — not documentation. Each runs on GitHub Actions, commits under its own identity, and produces deliverables.

## Fleet Taxonomy

The organism contains multiple classes of autonomous entities. Here is how they differ:

### 🤖 Bots (CI/CD Automation)
**What they are:** GitHub Actions workflows with dedicated identities that auto-commit.
**How they work:** Trigger on push/PR/schedule, run scripts, produce artifacts, commit reports.
**Examples:** organism-build-bot, organism-sentinel-bot, organism-alpha-bot

### 🧬 Agents (Cognitive Organs)
**What they are:** Living SDK modules inside `sdk/agents/` that form the Civitas runtime.
**How they work:** Run inside the organism's cognitive loop (CHRONO beats). Have internal state, reasoning, memory.
**Examples:** ANIMUS (mind), CORPUS (body), SENSUS (senses), MEMORIA (memory)

### 🕷️ Crawlers (Discovery & Mapping)
**What they are:** Bots specialized in traversing and mapping the organism's structure.
**How they work:** Walk directories, parse exports, trace dependencies, find dead code.
**Examples:** organism-crawler-bot

### 🧠 Synthetic Beings (AI Runtimes)
**What they are:** Multi-language runtime instances in `organism/` that execute intelligence.
**How they work:** Run as TypeScript, Python, C++, Java, Motoko, or Web runtimes.
**Examples:** organism/typescript, organism/python, organism/motoko

### 🧫 Protocols (Intelligence Wiring)
**What they are:** The 38+ intelligence protocols in `protocols/` that define how the organism thinks.
**How they work:** Each is a self-contained AI module (learning, memory, routing, sensing).
**Examples:** Hebbian Learning, Reward Signal, Attention Routing, Meta-Learning

### 🔌 Engines (Core Infrastructure)
**What they are:** The 4 foundational engines in `sdk/engines/` that power everything.
**How they work:** CHRONO (time), NEXORIS (state), QUANTUM_FLUX (randomness), COREOGRAPH (messaging).

---

## Fleet Divisions

### 🏗️ Division I — Build & Package
Responsible for compiling, packaging, and distributing all organism artifacts.

| Bot | Emoji | What It Does |
|-----|-------|-------------|
| organism-build-bot | 🧬 | Zips all 38 browser extensions |
| organism-sdk-bot | 📦 | Validates & packages 18 SDKs for npm |
| organism-release-bot | 🚀 | Builds everything, creates GitHub Releases |

### 🔬 Division II — Validate & Test
Responsible for ensuring correctness, integrity, and quality.

| Bot | Emoji | What It Does |
|-----|-------|-------------|
| organism-test-bot | 🧪 | Cross-matrix testing on Node 18/20/22 |
| organism-protocol-bot | 🔬 | Lints protocols, detects circular deps |
| organism-neural-bot | 🧠 | Validates neural architecture graph |
| organism-sandcastle-bot | 🏰 | Sandboxed build-test-land pipeline |
| organism-visual-bot | 📸 | Visual regression, screenshots, video |

### 🛡️ Division III — Secure & Monitor
Responsible for security, dependency health, and ongoing surveillance.

| Bot | Emoji | What It Does |
|-----|-------|-------------|
| organism-sentinel-bot | 🛡️ | Security audits, CSP, secrets scanning |
| organism-deps-bot | 🔄 | Dependency staleness & vulnerability scanning |
| organism-crawler-bot | 🕷️ | Maps organism, finds dead code & orphan files |

### 📚 Division IV — Document & Report
Responsible for keeping documentation current and comprehensive.

| Bot | Emoji | What It Does |
|-----|-------|-------------|
| organism-docs-bot | 📚 | Generates catalogs, encyclopedias, references |

### 🌐 Division V — Deploy & Operate
Responsible for deployment, infrastructure, and runtime operations.

| Bot | Emoji | What It Does |
|-----|-------|-------------|
| organism-deploy-bot | 🌐 | ICP canister deployment & Pages hosting |

### 🧠 Division VI — Learn & Evolve
Responsible for continuous improvement, learning, and economic intelligence.

| Bot | Emoji | What It Does |
|-----|-------|-------------|
| organism-learning-bot | 🎓 | Trains Hebbian synapses from CI outcomes, evolves protocol weights |
| organism-economy-bot | 💰 | Marketplace analytics, SDK/extension usage tracking |

### 👑 Division VII — Command & Control
The fleet commander. Has authority over all other divisions.

| Bot | Emoji | What It Does |
|-----|-------|-------------|
| organism-alpha-bot | 👑 | Fleet orchestration, health monitoring, policy enforcement |

---

## Alpha Bot Authority

The **organism-alpha-bot** (👑) is the fleet commander with the following authorities:

1. **Orchestration** — Can trigger any bot workflow via `workflow_dispatch`
2. **Health Monitoring** — Monitors all bot workflow run statuses
3. **Policy Enforcement** — Enforces fleet-wide rules (commit format, report structure)
4. **Escalation** — Creates issues when bots fail repeatedly
5. **Fleet Census** — Maintains a live inventory of all bots and their last-run status
6. **Cross-Division Coordination** — Ensures Division I doesn't release without Division II approval

## Bot Identity Rules

1. Every bot commits under `organism-{name}-bot <organism-{name}-bot@users.noreply.github.com>`
2. Every bot commit message starts with its emoji
3. Every bot produces a report in `docs/`
4. Every bot has a workflow in `.github/workflows/organism-{name}-bot.yml`
5. Every bot has a script in `scripts/`
6. The Alpha bot can trigger any other bot

## Lifecycle States

```
DORMANT → TRIGGERED → RUNNING → REPORTING → COMMITTING → COMPLETE
                                     ↓
                                   FAILED → ESCALATED (Alpha creates issue)
```

---

## Fleet Metrics

| Metric | Current |
|--------|---------|
| Total Bots | 15 |
| Divisions | 7 |
| Protocols | 38 |
| Agents | 4 |
| Engines | 4 |
| Runtimes | 6 |
| Extensions | 38 |
| SDKs | 18 |

---
*Organism Bot Fleet Charter v1.0 — Maintained by organism-alpha-bot*
