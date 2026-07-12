# Aether Sovereign Platform: Protocol Manifest

**Date:** 2026-07-05  
**Total Protocols:** 15 + (30 multimodal from Julia/Haskell/Idris/PureScript packages)  
**Status:** All protocols in production with phi constants (PHI=1.618, PHI_INV=0.618, HEARTBEAT_MS=873)

---

## Core Intelligence Protocols (10)

These protocols are the foundation of the Aether platform intelligence layer and are wired to the 6 foundation agents.

### Federation & Orchestration

#### PROTO-FED-001: Agent Federation Mesh
- **Agent:** NEXUS  
- **Function:** Binds agents into a sovereign mesh with ring-affinity routing
- **Methods:** `delegate()`, `negotiate()`, `coherence()`
- **Key Feature:** Coherence gate at φ⁻¹ = 0.618
- **Handler:** `FederationMesh` class in `protocols/agent-federation-protocol.js`

#### PROTO-WORK-001: Task Orchestration DAG
- **Agent:** NEXUS  
- **Function:** DAG-based task scheduling with topological execution
- **Methods:** `add()`, `readyQueue()`, `markDone()`, `markFailed()`, `propagateCancellation()`
- **Key Feature:** Phi-weighted task prioritization
- **Handler:** `TaskDAG` class in `protocols/task-orchestration-protocol.js`

### Synthesis & Generation

#### PROTO-GEN-001: Multimodal Synthesis
- **Agent:** PYTHIA + PLEXA  
- **Function:** Fuses text, code, image, audio, and data modalities
- **Methods:** `fuse()`, `channel()`, `getModalityMatrix()`
- **Key Feature:** Channel-weighted consensus using phi decay
- **Handler:** `MultimodalSynthesizer` class in `protocols/multimodal-synthesis-protocol.js`

#### PROTO-GEN-002: Website Generation
- **Agent:** PLEXA  
- **Function:** Generates full site specs (tokens, components, routing, deploy config)
- **Methods:** `generateSiteSpec()`, `phiDesignTokens()`, `componentTree()`, `routingConfig()`, `pagesConfig()`
- **Targets:** SvelteKit, Next.js, Astro, Remix, vanilla HTML/CSS
- **Handler:** Functions in `protocols/website-generation-protocol.js`

### Finance & Trading

#### PROTO-FIN-001: Finance Signal Processor
- **Agent:** NOVA  
- **Function:** EMA-based signal processing with phi gates and coherence thresholds
- **Methods:** `phiEMA()`, `signalCoherence()`, `process()`
- **Signal Tiers:** SOVEREIGN, COHERENT, CHAOTIC
- **Handler:** `FinanceSignalProcessor` class in `protocols/finance-signal-protocol.js`

#### PROTO-FIN-002: Trading Execution
- **Agent:** (Orchestrator directly)  
- **Function:** Validate → Route → Fill pipeline with 3 phi gates
- **Methods:** `validate()`, `route()`, `fill()`, `execute()`
- **Key Feature:** Gate 1 (phi^2 min), Gate 2 (phi coherence check), Gate 3 (fill sanity)
- **Handler:** `ExecutionEngine` class in `protocols/trading-execution-protocol.js`

### Infrastructure & Deployment

#### PROTO-INFRA-001: Infrastructure Codegen
- **Agent:** VIGIL + HERMES  
- **Function:** Generates deployment configs across multi-cloud
- **Targets:** Cloudflare Workers, ICP, Terraform, Docker Compose, GitHub Actions
- **Methods:** `generate()`, `wranglerToml()`, `icpConfig()`, `terraformLambda()`, `composeService()`, `githubCiWorkflow()`
- **Handler:** Functions in `protocols/infrastructure-codegen-protocol.js`

### Evaluation & Intelligence

#### PROTO-AI-001: AI Evaluation
- **Agent:** PYTHIA  
- **Function:** Model ranking via phi-weighted rubric
- **Methods:** `record()`, `rankings()`, `bestFor()`, `selectBest()`
- **Dimensions:** accuracy, coherence, code_correctness, tool_use, retrieval, latency, cost, multimodal, agent_goal
- **Weighting:** accuracy × φ³, coherence × φ², tool_use × φ, cost × 1
- **Handler:** `ModelEvaluator` class in `protocols/ai-evaluation-protocol.js`

### Federation Mesh

#### PROTO-FED-002: Sovereign Federation
- **Agent:** VIGIL  
- **Function:** Cross-substrate mesh (Workers, canisters, Lambda, bare metal)
- **Substrates:** GATEWAY, WORKER, CANISTER, RELAY, ORACLE, EDGE
- **Methods:** `route()`, `broadcast()`, `heartbeat()`, `coherence()`, `pulse()`
- **Ring Ordering:** SovereignRing → SovereignEdgeRing → ... → InterfaceRing (11 rings)
- **Handler:** `SovereignFederation` class in `protocols/sovereign-federation-protocol.js`

### Workflows

#### PROTO-WORK-002: Workflow Engine
- **Agent:** NOVA + HERMES  
- **Function:** Named workflow templates with phi-decay feedback
- **Templates:** onboarding, release, trade, analysis, build_site, agent_eval
- **Methods:** `tick()`, `snapshot()`, `listTemplates()`
- **Key Feature:** Each workflow is a DAG of named tasks with ring affinity
- **Handler:** `WorkflowInstance` class in `protocols/workflow-engine-protocol.js`

---

## Advanced Protocol Cores (5)

These extend the platform into specific verticals and pair with the core 10 for deep intelligence.

### Advanced Finance

#### PROTO-FIN-003: Trading Signals
- **Module:** `protocols/trading-signals-protocol.js`
- **Function:** Mean reversion, momentum, volatility smile, Kuramoto coherence
- **Methods:** `analyze()`, `meanReversion()`, `momentum()`, `volatility()`, `kuramotoCoherence()`
- **Key Feature:** Composite signal tier (STRONG_BUY, BUY, NEUTRAL, SELL)
- **Use Case:** Deriving multi-factor trading signals from price arrays

#### PROTO-FIN-004: Portfolio Optimization
- **Module:** `protocols/portfolio-optimization-protocol.js`
- **Function:** Efficient frontier via phi-weighted covariance and Sharpe ratio
- **Methods:** `optimize()`, `rebalance()`, `sharpeRatio()`, `phiCov()`
- **Key Feature:** Monte Carlo optimization with phi decay on constraints
- **Use Case:** Asset allocation and phi-aware portfolio rebalancing

### Advanced AI

#### PROTO-AI-002: Model Orchestration
- **Module:** `protocols/model-orchestration-protocol.js`
- **Function:** Route tasks to best-fit model, orchestrate fine-tuning, track success
- **Methods:** `enqueueTask()`, `scheduleTask()`, `submitFineTuning()`, `checkFinetuningStatus()`, `pulse()`
- **Key Feature:** Phi-decay feedback on model success rates and coherence
- **Use Case:** Multi-model inference routing with automatic fine-tuning

### Architecture

#### PROTO-ARCH-001: Architecture Discovery
- **Module:** `protocols/architecture-discovery-protocol.js`
- **Function:** Analyze codebases for architectural patterns
- **Patterns:** Monolith, Layered, Microservices, Event-Driven, Pipeline, Modular
- **Methods:** `analyzeStructure()`, `getRecommendations()`, `snapshot()`
- **Key Feature:** Phi-weighted metrics (cohesion, coupling, modularity, scalability)
- **Use Case:** Architectural health assessment and refactoring guidance

### Content & Web

#### PROTO-GEN-003: Site Analytics
- **Module:** `protocols/site-analytics-protocol.js`
- **Function:** Real-time website analytics with engagement funnels
- **Methods:** `recordEvent()`, `updateSession()`, `recordConversion()`, `computeMetrics()`, `getRecommendations()`
- **Metrics:** bounce rate, session duration, conversion rate, page health
- **Use Case:** Post-launch site optimization and engagement analysis

#### PROTO-GEN-004: Content Generation
- **Module:** `protocols/content-generation-protocol.js`
- **Function:** SEO-optimized content generation with editorial calendar
- **Methods:** `generateContent()`, `scheduleContent()`, `optimizeForSEO()`, `snapshot()`
- **Content Types:** Blog Post, Landing Page, Product Page, Tutorial, Case Study, Newsletter
- **Scoring:** Readability, keyword relevance, engagement (phi-weighted)
- **Use Case:** Scalable content creation and SEO optimization

---

## Historical Protocol Stack (30 Languages)

### Julia (10 protocols)
Foundation: Julia-ML/numerical computing base
- PROTO-J001 through PROTO-J010 (DSL, matrix ops, physics simulation, etc.)
- All in `organism/julia/src/Organism/Protocols/`

### Haskell (10 protocols)
Foundation: Type-safe functional core with phantom types
- PROTO-HS-001 through PROTO-HS-010 (graph routing, ring affinity, Kleisli composition, etc.)
- All in `organism/haskell/src/Organism/Protocols/`

### Idris (5 protocols)
Foundation: Dependent types and proofs
- PROTO-ID-001 through PROTO-ID-005 (bounded registers, proven pipelines, Vect-sized history, etc.)
- All in `organism/idris/src/Organism/Protocols/`

### PureScript (5 protocols)
Foundation: Haskell-to-JavaScript bridge
- PROTO-PS-001 through PROTO-PS-005 (reactive cells, infinite streams, Worker deployment, Kuramoto JS, FFI bridges)
- All in `organism/purescript/src/Organism/Protocols/`

---

## Integration: 6 Foundation Agents → 15 Core Protocols

Each agent is wired to its matched protocols via `agents/_lib/protocol-loader.js`:

| Agent | Protocols | Role |
|-------|-----------|------|
| **NEXUS** | FED-001, WORK-001 | Federation mesh + task orchestration |
| **PYTHIA** | GEN-001, AI-001 | Multimodal synthesis + model evaluation |
| **VIGIL** | FED-002, INFRA-001 | Sovereignty auditing + infra codegen |
| **NOVA** | FIN-001, WORK-002 | Finance signals + workflow orchestration |
| **PLEXA** | GEN-002, GEN-001 | Website generation + multimodal fusion |
| **HERMES** | INFRA-001, WORK-002 | Deployment automation + release workflows |

---

## Platform REST API: Protocol Endpoints

```
GET  /api/protocols              — list all 15 registered protocols
GET  /api/protocols/:id          — check protocol workload status
POST /api/protocols/:id/deploy   — deploy a protocol as a workload
```

Protocols are first-class deployable units via the Aether control plane (Platform).

---

## Phi Constants (Universal)

All protocols use:
- **PHI** = 1.618033988749895 (golden ratio)
- **PHI_INV** = 0.618033988749895 (1/φ)
- **HEARTBEAT_MS** = 873 (pulsing interval in ms)
- **Coherence Threshold** = φ⁻¹ ≈ 0.618 (gates deploy & delegation)

---

## Deployment Readiness

✅ All 15 core protocols: **production-ready**  
✅ All 30 multimodal protocols (Julia/Haskell/Idris/PureScript): **production-ready**  
✅ 6 foundation agents wired: **all-green Sandcastle**  
✅ Protocol registry: **15 protocols registered**  
✅ Orchestrator integrated: **protocols → workloads**  
✅ REST API: **deploy protocols via control plane**

**Status:** Ready to rival SUSE Rancher and beyond.
