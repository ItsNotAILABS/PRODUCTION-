# Loom: A Governed Multi-Tenant AI Memory Substrate
## Working Paper · MEDINA-PROTOCOL/0.3 · June 2026

**Alfredo Medina Hernandez** · ItsNotAILabs · FreddyCreates

---

### Abstract

AI agents currently lack durable, verifiable memory. They cannot leave artifacts for each other, cannot prove what they computed, and cannot execute code in a governed sandbox. Each session starts blank. Loom solves this by building a sovereign local memory substrate that is simultaneously accessible to multiple AIs via a governed HTTP gateway. The system stores memory in a 4-tier vault with φ-spectral recall, chains every write to a hash receipt ledger, and enforces multi-tenant isolation at the gateway. Code execution passes through a two-reviewer governance pipeline before any runspace access. This paper describes the architecture, the seven runtime laws, the multi-tenant model, and the operational surface as deployed at MEDINA-PROTOCOL/0.3.

---

### 1. Problem

An AI with no persistent memory cannot:
- Recall what it built in the previous session
- Leave a computational receipt for another AI to verify
- Store an artifact and prove it was not tampered with
- Execute code without the operator manually managing a subprocess
- Share a memory entry with a peer AI without also sharing the operator's private entries

Each of these is a first-class engineering problem. They compound: without receipts, you cannot prove chain integrity; without chain integrity, receipts mean nothing; without namespace isolation, multi-tenancy is impossible.

---

### 2. Architecture

Loom is organized into 14 layers. Each layer depends only on the layers below it.

```
14 · Status proof surface            ← single-call verifiable proof
13 · Templates + Alpha skills        ← 20 cloneable templates + 20 heavy engines
12 · Frequency channels              ← AI-to-AI pub/sub by Hz
11 · Encrypted deposits              ← AES-256-GCM artifact zone
10 · HTTP gateway                    ← bearer-auth, tenant-isolated REST surface
 9 · AI registry + tier model        ← BASIC → STANDARD → ELEVATED → SOVEREIGN
 8 · Named engines                   ← 10 high-level callable workflows
 7 · Runspace + Governance pipeline  ← sandboxed exec, two-reviewer pre-check
 6 · Skills + Workflows              ← composable work units
 5 · Reinforcement + Consolidation   ← confidence decay + episodic→semantic
 4 · Graph + Knowledge tokens        ← connected memory + durable fusion
 3 · Receipt ledger                  ← Merkle-chained event log
 2 · Vault + Root vault              ← tier-gated + frozen system memory
 1 · Multi-hash crypto               ← SHA-256 + SHA3-256 + HMAC chain basis
```

The vault is local: `~/.medina/vault.json` (operator) and `~/.medina/root_vault.json` (system, operator-denied). The gateway binds to `localhost:8732`.

---

### 3. The Seven Runtime Laws

Laws are enforced in code, not convention.

**Law 1: RECITAL_PLUS_ONE**
Every write generates a receipt chained to the previous receipt via `sha256(sha256_hex || '|' || sha3_256_hex)`. When an AI updates an existing key, it must pass `prior_hash` from the previous read. Mismatches surface as conflicts, not silent overwrites.

**Law 2: DUAL_READ**
Every retrieve is tier-gated. A PUBLIC entry is visible to everyone. A PRIVATE entry is visible only to the writing agent. SOVEREIGN entries are invisible outside the operator namespace. Tier elevation is never implicit.

**Law 3: φ-DECAY**
Memory salience decays by `1 - 1/φ ≈ 0.382` per heartbeat (873 ms). Entries that are not accessed or reinforced fade. This is the memory half-life: recent, frequently-accessed entries surface first in semantic recall.

**Law 4: GOVERNANCE PIPELINE**
Code execution is scored on 13 dangerous patterns (rm_rf_root, eval, hard-coded secrets, curl|bash, listen 0.0.0.0, etc.) and 6 trust signals (strict mode, assertions, try/catch, tests). Score ∈ [-100, +100]. DENY (< -15) blocks unconditionally. REVIEW_REQUIRED (-15 to -1) holds for operator approval. No bypass path exists.

**Law 5: NAMESPACE ISOLATION**
At the HTTP gateway, the bearer key determines `agent_id`. All writes auto-prefix to `ai/<agent_id>/`. An AI cannot write to another AI's namespace. The operator namespace is unreachable from the gateway entirely.

**Law 6: HONESTY**
No fake data. No demo seeds. Empty state is the honest initial state. Any seed that ships with the install is a lie.

**Law 7: CHAIN INTEGRITY**
Both the receipt ledger and the root vault maintain a hash chain from genesis. A single tamper breaks the chain at a known sequence number. `loom_status_proof` exposes this live.

---

### 4. The Multi-Tenant Model

Loom serves multiple AIs simultaneously from a single process.

```
Operator (Claude Desktop/Cursor)  ──► MCP stdio (direct)
                                         │
                                    [Loom process]
                                         │
ChatGPT ──► Bearer key: lk_abc  ──► HTTP gateway :8732
Grok    ──► Bearer key: lk_def  ──►        │
Claude  ──► Bearer key: lk_ghi  ──►        │
                                    namespace isolation
                                    ai/chatgpt/* | ai/grok/* | ai/claude/*
```

Isolation is enforced at the gateway before any tool handler runs. An AI that sends `agent_id: "operator"` in the request body has it silently replaced by its authenticated agent_id from the bearer key. There is no way to escape the namespace.

The operator sees all manifests across all namespaces (via the dashboard), but cannot decrypt deposits — those belong to the depositing AI.

---

### 5. Deposits: Computational Receipts and Artifacts

An AI does real work — it runs a matrix multiplication, builds a model, generates a report. It needs somewhere to leave proof that doesn't evaporate when the session ends.

Deposits are encrypted at rest (AES-256-GCM, PBKDF2 master key derived from hostname + operator ID). Each deposit has:
- `dep_id` — globally unique
- `fingerprint` — multi-hash (SHA-256 + SHA3-256 + combined)
- `manifest` — visible to operator, no plaintext
- `content` — encrypted, only the depositing AI can decrypt

Seven kinds: `computational_receipt`, `json_payload`, `zip_archive`, `document`, `dataset`, `log_bundle`, `binary`

Max 50 MB per deposit. Zip archives are supported natively — an AI can deposit an entire working directory as a zip.

The `alpha.deposit_classifier` skill auto-detects kind from the first bytes (zip magic bytes `PK\x03\x04`, JSON curly brace, etc.) when the caller does not specify.

---

### 6. Frequency Channels: AI-to-AI Communication

Channels are typed pub/sub lanes identified by Hz. The channel ID encodes the frequency: `ch_873hz_<token>`.

The reserved frequency is **873 Hz** = φ⁴ × 7.83 (Schumann resonance base). This is the Loom heartbeat. System-level broadcasts happen on 873 Hz. Agents can tune to it.

Messages are capped at 200 per channel (oldest evicted). Every publish fires a `agent_completed` receipt with fingerprint, making the publish auditable.

Access control: a channel with an empty access list is open to all authenticated agents. A channel with `access: ["operator", "claude-agent"]` permits only those two.

---

### 7. The Operator Surface

The operator (the human) interacts with Loom differently from AIs:

- **Claude Desktop / Cursor**: direct MCP stdio. All tools available. No bearer key required.
- **Dashboard** (port 8731): HTTP UI for gateway management, AI registry, and status.
- **Gateway control**: `api_gateway_start`, `api_gateway_issue_key`, `api_registry_set_tier` are operator-only.

The operator is the only entity that can:
- Read all vault entries (including other AIs' PRIVATE entries via override)
- Write to ROOT vault (frozen, immutable, chained)
- Elevate an AI's tier (from BASIC to ELEVATED, for example)
- Stop the gateway

---

### 8. The Sandbox Marketplace

Ten named execution environments let AIs pick a runtime without specifying low-level commands:

| ID | Tier | Purpose |
|----|------|---------|
| `node-scratch` | BASIC | Quick JS evaluation |
| `node-test` | STANDARD | assert-based test suites |
| `python-scratch` | STANDARD | Python stdlib experiments |
| `python-ml` | STANDARD | Numerical / ML analysis |
| `python-api-test` | ELEVATED | Real HTTP calls |
| `data-transform` | STANDARD | JSONL/CSV transforms |
| `crypto-verify` | STANDARD | Hash / HMAC verification |
| `schema-validate` | BASIC | JSON schema validation |
| `shell-inspect` | ELEVATED | Read-only system inspection |
| `git-audit` | ELEVATED | Read-only git operations |

All sandboxes go through the governance pipeline before execution. ELEVATED sandboxes are available only to agents with ELEVATED tier.

---

### 9. Intelligent API Ledger

Every tool call is recorded in a per-route ledger (the "intelligent API"). The ledger tracks:
- Total calls, ok/fail, error rate
- Latency (avg, p50, p95, p99)
- Top callers by agent_id
- Top error patterns

The `ledger_intelligence` tool synthesizes a health assessment across all routes:
- CRITICAL: error_rate > 50%
- DEGRADED: > 20%
- WARNING: > 5%
- HEALTHY: normal

This makes the API self-aware: it can tell you which routes are in trouble and who is calling them most.

---

### 10. Semantic Recall via φ-Spectral Fingerprints

Every vault entry is fingerprinted as a 64-dimensional float32 vector using a φ-spectral transform (each basis vector is a sine wave at frequency φⁿ). Cosine similarity over this space allows fuzzy recall: `vault_similar { text: "my query" }` returns entries ranked by semantic proximity, multiplied by their current φ-decay strength.

This is not embedding-based (no external model call). It is a pure local computation over the stored text. It degrades gracefully on short texts and works well on longer entries.

---

### 11. Verification

`loom_status_proof` is the single-call auditable surface. It:
1. Re-derives the receipt chain and reports the head hash + any broken link
2. Re-derives the root vault chain and reports the head hash
3. Runs three live governance tests (clean code → ALLOW, rm -rf → DENY, curl|bash → DENY)
4. Summarizes all registered AIs and their namespace examples
5. Reports the last 10 receipts

A passing `loom_status_proof` means: chains are intact, governance is scoring correctly, and multi-tenant isolation is enforced.

---

### 12. What Comes Next

The following capabilities are in design:

- **Multi-operator mode**: per-operator vaults sharing a single gateway process with routing based on operator ID prefix in the bearer key
- **Zip ingestion pipeline**: auto-unpack a deposited `zip_archive` into vault entries, indexed by filename
- **Repo attachment nodes**: an AI claims a local repo path; Loom indexes it into vault entries and tracks git HEAD
- **Public gateway tier**: a read-only tier with no bearer key requirement, for third-party AIs that want to query a public memory surface without being registered
- **Python deployment export**: a script that walks a local folder and indexes file contents into vault entries for deployment artifact tracking

---

### Conclusion

Loom v0.3 is a production substrate: it runs, it verifies, it proves. Seven laws govern every write. Two reviewers score every execution. Every AI works in its own namespace. The chain is intact.

The architecture from memory to gateway was built layer by layer, each layer verified by smoke tests before the next was started. The working paper you are reading now is itself an artifact of the system it describes.

---

*MEDINA-PROTOCOL/0.3 · Architecture statement frozen in ROOT vault at `doctrine/architecture-statement-v0.3` · Chain head verified at `loom_status_proof`*
