# Loom API Reference
**MEDINA-PROTOCOL/0.3 · Loom v0.3**

Loom exposes two surfaces: **MCP** (stdio JSON-RPC, for Claude/Cursor/Cline/Continue/Zed) and an **HTTP Gateway** (port 8732, for ChatGPT, custom agents, any HTTP client).

---

## Quick Start

### As the Operator (you)

Claude Desktop / Cursor reads tools via MCP. You call tools directly by name:

```
loom.vault_store { key: "my_note", value: "content", tier: "PRIVATE" }
loom.loom_status_proof {}
loom.api_gateway_start { port: 8732 }
loom.api_gateway_issue_key { name: "chatgpt", agent_id: "chatgpt-custom-gpt" }
```

### As an External AI (ChatGPT, scripts, etc.)

```bash
# Start gateway from Claude Desktop first:
# loom.api_gateway_start {}
# loom.api_gateway_issue_key { name: "myai", agent_id: "myai-v1" }

curl http://localhost:8732/.well-known/openai-functions
curl http://localhost:8732/v1/me -H "Authorization: Bearer lk_..."
curl -X POST http://localhost:8732/v1/tools/vault_store \
     -H "Authorization: Bearer lk_..." \
     -H "Content-Type: application/json" \
     -d '{"key":"my_note","value":"hello","tier":"PRIVATE"}'
```

---

## Auth

All HTTP gateway calls require `Authorization: Bearer <key>`.

Issue keys via MCP: `loom.api_gateway_issue_key { name, agent_id }` → returns `key` once. Save it — it cannot be retrieved again.

Keys are tied to an `agent_id`. All vault writes from that key auto-prefix to `ai/<agent_id>/`. An AI cannot write to another AI's namespace or the operator namespace.

---

## Tier Model

| Tier | Who | Read | Write | Deposits | Runspace | Root |
|------|-----|------|-------|----------|----------|------|
| BASIC | any AI | public entries | — | — | — | — |
| STANDARD | issued key | public + shared | own namespace | create/get | — | — |
| ELEVATED | trusted agent | + PRIVATE | own + shared | full | governed exec | read |
| SOVEREIGN | operator only | all | all | all | ungoverned | full |

---

## MCP Tools (stdio)

### Vault

| Tool | Inputs | Returns |
|------|--------|---------|
| `vault_store` | `key`, `value`, `tier?`, `agent_id?`, `prior_hash?` | `{ok, key, hash, seq}` |
| `vault_get` | `key`, `agent_id?` | `{ok, key, value, tier, hash, created_at}` |
| `vault_list` | `agent_id?`, `tier?`, `limit?` | `{ok, entries[]}` |
| `vault_delete` | `key`, `agent_id?` | `{ok}` |
| `vault_search` | `query`, `agent_id?`, `tier?`, `limit?` | `{ok, results[]}` |
| `vault_similar` | `text`, `agent_id?`, `tier?`, `limit?`, `min_score?` | `{ok, results[]}` |
| `vault_fingerprint` | `text` | `{ok, fingerprint, dim}` |

**RECITAL_PLUS_ONE**: when updating an existing key, pass `prior_hash` from the last `vault_get` response. Loom chains the hash; mismatch is a conflict signal.

### Root Vault

Root is append-only, frozen, operator-level. AIs with ELEVATED tier may read; writes require SOVEREIGN.

| Tool | Inputs | Returns |
|------|--------|---------|
| `root_write` | `key`, `value`, `kind?`, `agent_id?` | `{ok, key, hash}` |
| `root_read` | `key` | `{ok, value, hash, kind}` |
| `root_list` | `prefix?`, `kind?` | `{ok, entries[]}` |

### Templates (20 cloneable)

| Tool | Inputs | Returns |
|------|--------|---------|
| `templates_list` | `family?` | `{ok, templates[{id,name,family,description}]}` |
| `templates_families` | — | `{notebook:[...], document:[...], code:[...], data:[...]}` |
| `templates_pull` | `id` | `{ok, id, body, input_schema}` |
| `templates_clone` | `id`, `input?`, `name?`, `agent_id?` | `{ok, clone_id, value, fingerprint}` |

**Template IDs** by family:

- **notebook**: `notebook.jupyter_python`, `notebook.python_scratch`, `notebook.node_scratch`, `notebook.sql_workbook`, `notebook.ml_experiment`
- **document**: `document.research_brief`, `document.meeting_notes`, `document.status_report`, `document.project_plan`, `document.incident_postmortem`
- **code**: `code.cli_skeleton`, `code.api_server`, `code.test_harness`, `code.build_script`, `code.deploy_script`
- **data**: `data.csv_pipeline`, `data.json_transformer`, `data.sql_migration`, `data.etl_template`, `data.dataset_card`

### Frequency Channels (AI-to-AI pub/sub)

| Tool | Inputs | Returns |
|------|--------|---------|
| `channel_create` | `name`, `frequency_hz`, `description?`, `access?[]`, `agent_id?` | `{ok, id, frequency_hz}` |
| `channel_list` | — | `{ok, channels[]}` sorted by frequency |
| `channel_subscribe` | `channel_id`, `agent_id` | `{ok, subscribers_count}` |
| `channel_unsubscribe` | `channel_id`, `agent_id` | `{ok}` |
| `channel_publish` | `channel_id`, `agent_id`, `body` | `{ok, msg_id, fingerprint, subscribers}` |
| `channel_read` | `channel_id`, `agent_id?`, `since_ts?` | `{ok, messages[]}` |
| `channel_stats` | `channel_id?` | `{ok, ...stats}` |

Channel IDs encode the frequency: `ch_873hz_<token>`. Access list: empty = open to all; otherwise only listed `agent_id`s may publish.

**Reserved frequency**: 873 Hz = φ⁴ × 7.83 (Schumann) — the Loom heartbeat. Use this for system-wide broadcasts.

### Deposits (encrypted artifact storage)

AIs deposit computational receipts, zips, JSON payloads. Encrypted AES-256-GCM at rest. Only the depositing AI can decrypt.

| Tool | Inputs | Returns |
|------|--------|---------|
| `deposit_create` | `agent_id`, `content_b64`, `kind?`, `label?`, `metadata?` | `{ok, dep_id, fingerprint, size_bytes}` |
| `deposit_list` | `agent_id` | `{ok, deposits[{dep_id,kind,label,size_bytes,created_at}]}` |
| `deposit_get` | `dep_id`, `agent_id` | `{ok, content_b64, kind, label, metadata}` |
| `deposit_describe` | `dep_id` | `{ok, ...manifest}` (no plaintext — operator-safe) |
| `deposit_stats` | — | `{ok, total, by_kind, total_bytes}` |

**Kinds**: `computational_receipt` · `json_payload` · `zip_archive` · `document` · `dataset` · `log_bundle` · `binary`

Max size: 50 MB per deposit. Content must be base64.

### Alpha Skills (20 heavy engines)

Call via `skills_run { name: "alpha.<skill>", input: {...} }`.

| Skill | What it does |
|-------|-------------|
| `alpha.codebase_audit` | Static scan: TODOs, FIXMEs, deep nesting, long files, complexity flags |
| `alpha.dependency_graph` | Parse imports → build dependency map + cycles |
| `alpha.api_test_suite_gen` | Generate assert-based test suite from OpenAPI spec |
| `alpha.data_quality_audit` | Profile a dataset: nulls, types, ranges, anomalies |
| `alpha.changelog_compose` | Compose CHANGELOG from commit messages + categories |
| `alpha.deploy_dry_run` | Pre-flight: env vars, semver, no leaked secrets, config check |
| `alpha.security_scan` | Pattern scan: hard-coded keys, eval, shell injection, weak crypto |
| `alpha.documentation_generate` | Generate API/module docs from function signatures + comments |
| `alpha.refactor_proposal` | Identify dead code, duplicates, long functions → proposals |
| `alpha.cost_estimate` | Estimate cloud cost: compute, egress, storage, API calls |
| `alpha.knowledge_dossier` | Assemble a dossier on a topic from vault + knowledge tokens |
| `alpha.failure_remediation_plan` | Map known failures to remediation steps |
| `alpha.system_self_audit` | Full self-check: chain integrity, vault health, receipts, layers |
| `alpha.session_onboard` | First-call onboard: who am I, what's my tier, what can I do |
| `alpha.workflow_recipe_builder` | Compose a multi-step workflow recipe from named skills |
| `alpha.deposit_classifier` | Detect deposit kind from raw bytes (zip header, JSON, etc.) |
| `alpha.entry_resonance_check` | φ-spectral similarity check: does this entry resonate with vault? |
| `alpha.protocol_check` | Verify all 4 living protocols are installed and intact |
| `alpha.channel_broadcast` | Broadcast a message to all channels an agent is subscribed to |
| `alpha.complete_release` | End-to-end release: audit → changelog → dry-run → broadcast |

### Living Protocols

| Tool | Inputs | Returns |
|------|--------|---------|
| `protocols_living_list` | — | `[{id, name, purpose}]` |
| `protocols_living_get` | `name` (`CHARTER`/`SYSTEM`/`OS`/`AGENTS`) | `{ok, body, purpose}` |
| `protocols_living_install` | `agent_id?` | `{ok, installed, keys[]}` |

The 4 protocols (CHARTER, SYSTEM, OS, AGENTS) live in ROOT, are frozen, and auto-install on every Loom boot.

### Sandbox Marketplace (10 named environments)

| Tool | Inputs | Returns |
|------|--------|---------|
| `market_list` | `tag?` | `[{id, name, description, tier_required, tags}]` |
| `market_get` | `sandbox_id` | `{ok, ...sandbox}` |
| `market_build_job` | `sandbox_id`, `code?`, `agent_id?`, `timeout_ms?` | `{ok, command, entry_file, code, tier_required}` |
| `market_tags` | — | `[...tags]` |
| `market_stats` | — | `{total, by_tier, by_tag}` |

**Sandbox IDs**: `node-scratch` · `node-test` · `python-scratch` · `python-ml` · `python-api-test` · `data-transform` · `crypto-verify` · `schema-validate` · `shell-inspect` · `git-audit`

Workflow: `market_build_job` → `runspace_create` → `runspace_write` (code to entry_file) → `runspace_exec` → `runspace_collect`

### Intelligent API Ledger

Every tool call is automatically recorded. Query it at any time.

| Tool | Inputs | Returns |
|------|--------|---------|
| `ledger_intelligence` | — | `{assessment, critical_routes, degraded_routes, busiest, slowest, total_calls}` |
| `ledger_route_stats` | `route` | `{calls_total, ok, fail, error_rate, avg_ms, p50, p95, p99, top_callers, top_errors}` |
| `ledger_all_stats` | — | `[...route_stats]` sorted by call volume |
| `ledger_all_health` | — | `[...{route, status, error_rate}]` sorted critical-first |
| `ledger_list_routes` | — | `[...route_names]` |

### Runspace (sandboxed code execution)

| Tool | Inputs | Returns |
|------|--------|---------|
| `runspace_create` | `agent_id?`, `timeout_ms?` | `{ok, job_id, path}` |
| `runspace_write` | `job_id`, `filename`, `content` | `{ok, path}` |
| `runspace_exec` | `job_id`, `command`, `args?[]`, `env?` | `{ok, stdout, stderr, exit_code, ms}` |
| `runspace_collect` | `job_id` | `{ok, files[]}` |
| `runspace_cleanup` | `job_id` | `{ok}` |
| `runspace_list` | — | `{ok, jobs[]}` |
| `runspace_review` | `code`, `language?`, `filename?` | `{ok, decision, score, flags}` |
| `runspace_exec_governed` | `job_id`, `code`, `command`, `args?`, `language?`, `filename?` | `{ok, stdout, stderr, review}` |
| `runspace_governance_stats` | — | `{total_reviews, by_decision, avg_score}` |

**Decision levels**: `TRUSTED` (+25 to +100) → `ALLOW` (0 to +24) → `REVIEW_REQUIRED` (-15 to -1) → `DENY` (< -15)

Allowed commands: `node`, `python`, `python3`, `sh`, `bash`, `git`, `npm`, `pip`

### AI Registry

| Tool | Inputs | Returns |
|------|--------|---------|
| `ai_registry_register` | `agent_id`, `name`, `description?`, `tier?` | `{ok, agent_id, tier, capabilities[]}` |
| `ai_registry_list` | — | `[{agent_id, name, tier, status, calls_total, last_seen}]` |
| `ai_registry_get` | `agent_id` | `{ok, ...agent}` |
| `ai_registry_set_tier` | `agent_id`, `tier` | `{ok, tier}` |
| `ai_registry_revoke` | `agent_id` | `{ok}` |
| `ai_registry_permits` | `agent_id`, `tool` | `{ok, permitted, tier}` |

### Crypto

| Tool | Inputs | Returns |
|------|--------|---------|
| `crypto_multi_hash` | `text` | `{sha256, sha3_256, combined}` |
| `crypto_chain_hash` | `prev_hash`, `payload` | `{hash, components}` |
| `crypto_hmac` | `key`, `text` | `{hmac}` |
| `crypto_hmac_verify` | `key`, `text`, `expected` | `{ok}` |
| `crypto_verify_chain` | `entries[]`, `genesis` | `{ok, first_broken_index?}` |
| `crypto_genesis` | `label` | `{genesis}` |

### Named Engines (10 high-level workflows)

| Tool | Inputs | Returns |
|------|--------|---------|
| `engines_list` | — | `[{name, description, inputSchema}]` |
| `engines_run` | `name`, `input?` | `{ok, steps[], summary, deliverables}` |
| `engines_stats` | — | `{total_runs, by_engine, last_runs[]}` |

**Engine names**: `morning_briefing` · `session_wrapup` · `health_check` · `consolidate_cold` · `compress_vault` · `train_on_failures` · `research_dossier` · `knowledge_check` · `daily_save` · `onboard_matter`

### Status & Proof

| Tool | Inputs | Returns |
|------|--------|---------|
| `loom_status` | — | `{version, layers, chain_integrity, gateway}` |
| `loom_status_proof` | — | Full audit: chains, governance tests, tenant isolation, last receipts, verdict |

### Semantic Compression

| Tool | Inputs | Returns |
|------|--------|---------|
| `compression_mine` | `corpus[]`, `min_freq?`, `min_savings?` | `{phrases, estimated_savings}` |
| `compression_compress` | `text` | `{compressed, ratio, symbols_used}` |
| `compression_expand` | `text` | `{expanded}` |
| `compression_stats` | — | `{symbol_count, formulas, total_compressed}` |

### Namespace

| Tool | Inputs | Returns |
|------|--------|---------|
| `namespace_who_owns` | `key` | `{ns, agent?}` |

### Skills & Knowledge

| Tool | Inputs | Returns |
|------|--------|---------|
| `skills_list` | — | `[{name, description}]` |
| `skills_run` | `name`, `input?` | `{ok, ...result}` |
| `knowledge_mint` | `label`, `body`, `sources[]`, `agent_id?` | `{ok, token_id, fingerprint}` |
| `knowledge_unwrap` | `token_id` | `{ok, label, body, sources[]}` |
| `knowledge_list` | — | `[{token_id, label}]` |

### Auto-Doctrine

| Tool | Inputs | Returns |
|------|--------|---------|
| `auto_doctrine_sweep` | — | `{ok, doctrine_written[], learning_written[], patterns[]}` |

---

## HTTP Gateway Endpoints (port 8732)

All require `Authorization: Bearer <key>` except `/health` and `/.well-known/openai-functions`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check → `{ok:true, version}` |
| `GET` | `/.well-known/openai-functions` | OpenAI custom GPT schema (all tier-permitted tools) |
| `GET` | `/v1/tools` | List available tools for your tier |
| `POST` | `/v1/tools/:name` | Call a tool. Body = JSON input object. |
| `GET` | `/v1/me` | Your AI registry record: agent_id, tier, capabilities, calls_total |
| `GET` | `/v1/protocol` | Living protocols (CHARTER, SYSTEM, OS, AGENTS) |
| `GET` | `/v1/handoffs` | Vault entries under `shared/*` addressed to you |

### Example: ChatGPT calling Loom

```json
POST /v1/tools/deposit_create
Authorization: Bearer lk_abc123...
Content-Type: application/json

{
  "kind": "computational_receipt",
  "label": "matmul-1024x1024",
  "content_b64": "eyJyZXN1bHQiOiAib2sifQ=="
}
```

Response: `{"ok":true,"dep_id":"dep_xyz...","fingerprint":"sha256|sha3|combined","size_bytes":42}`

Note: `agent_id` is injected from your bearer key — you cannot impersonate another agent.

---

## Namespace Rules

| Who writes | Key becomes |
|-----------|-------------|
| Operator (Claude Desktop) | `<key>` as-is |
| External AI `chatgpt-v1` | `ai/chatgpt-v1/<key>` |
| System calls | `system/<key>` |

An AI reading `ai/chatgpt-v1/my_note` is correct. An AI trying to read `ai/other-ai/secret` gets `ACCESS_DENIED`.

---

## Runtime Laws

These are code, not suggestions:

- **φ = 1.618033988749895** — spectral fingerprint basis
- **heartbeat = 873 ms** — φ⁴ × 7.83 Hz (Schumann resonance). Channel frequency for system events.
- **decay per beat = 1 - 1/φ ≈ 0.382** — memory salience half-life
- **RECITAL_PLUS_ONE** — every write chains the previous hash. Pass `prior_hash` when updating.
- **DUAL_READ** — tier-gated read. A PRIVATE entry cannot be read at BASIC tier.
- **No fake data** — empty state is honest; demo seeds are not.
- **Governance pipeline** — code execution scored [-100, +100] before runspace. DENY blocks; no bypass.

---

## Multi-Tenant Operation

Loom supports multiple AIs simultaneously:

1. `loom.api_gateway_start { port: 8732 }` — one-time operator action
2. `loom.api_gateway_issue_key { name: "claude-agent", agent_id: "claude-agent-v2" }` — per AI
3. Each AI uses its key; namespace isolation is enforced at the gateway, not at the client

All AIs share the same Loom process. Namespaces are isolated. The operator sees all manifests; AIs see only their own namespace + `shared/`.

---

*Generated from live server.mjs · MEDINA-PROTOCOL/0.3 · 2026-06-25*
