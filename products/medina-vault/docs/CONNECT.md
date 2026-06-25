# Loom Connection Guide
**MEDINA-PROTOCOL/0.5 · Loom v0.5.0**

Connect Loom to any AI host: Claude Desktop, Cursor, VS Code, Cline, Continue.dev, Codex, ChatGPT, or any HTTP client.

---

## What Loom exposes

| Surface | Port | Auth | For |
|---------|------|------|-----|
| **MCP stdio** | — | none (local) | Claude Desktop, Cursor, Cline, Continue, Zed, VS Code (Copilot MCP) |
| **HTTP Gateway** | 8732 | Bearer key | ChatGPT custom GPT, OpenAI Codex, any AI over HTTP |
| **Public HTTP** | 8732 | none | Read-only PUBLIC tier — no key required |
| **Dashboard** | 8731 | none | Browser UI at http://localhost:8731 |

---

## MCP Hosts (stdio)

### Claude Desktop

**macOS** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows** — edit `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "loom": {
      "command": "node",
      "args": ["C:/path/to/GPTREPO/products/medina-vault/src/server.mjs"]
    }
  }
}
```

Restart Claude Desktop. You'll see **178 tools** available under the loom MCP server.

### Cursor

Create or edit `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "loom": {
      "command": "node",
      "args": ["/path/to/products/medina-vault/src/server.mjs"]
    }
  }
}
```

### VS Code (Copilot MCP extension)

Install the MCP extension for VS Code, then add to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "loom": {
      "command": "node",
      "args": ["/path/to/products/medina-vault/src/server.mjs"],
      "env": {}
    }
  }
}
```

### Cline

In Cline settings → MCP Servers → Add Server:

```json
{
  "name": "loom",
  "command": "node",
  "args": ["/path/to/products/medina-vault/src/server.mjs"]
}
```

### Continue.dev

Edit `~/.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "loom",
      "command": "node",
      "args": ["/path/to/products/medina-vault/src/server.mjs"]
    }
  ]
}
```

### Zed

Add to your Zed `settings.json`:

```json
{
  "context_servers": {
    "loom": {
      "command": {
        "path": "node",
        "args": ["/path/to/products/medina-vault/src/server.mjs"]
      }
    }
  }
}
```

### Windsurf / Cascade

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "loom": {
      "command": "node",
      "args": ["/path/to/products/medina-vault/src/server.mjs"]
    }
  }
}
```

---

## HTTP Gateway (external AIs)

### Step 1 — Start the gateway

From Claude Desktop or any MCP client:

```
loom.api_gateway_start { port: 8732 }
```

Or from the Loom Dashboard (http://localhost:8731) → INFRA > Keys → Start Gateway.

### Step 2 — Issue a bearer key

```
loom.api_gateway_issue_key { name: "chatgpt", agent_id: "chatgpt-custom-gpt-v1" }
```

Or click **Generate API Token** in the dashboard. The key is shown **once** — save it.

### Step 3 — Connect your AI

#### ChatGPT Custom GPT

In your GPT's Actions configuration:

- **Schema URL**: `http://your-server:8732/.well-known/openai-functions`
- **Authentication**: API Key, Bearer token format
- **API Key**: `lk_...` (your issued key)

For cloud-deployed Loom (not localhost), use `ngrok http 8732` to get a public URL first.

#### OpenAI Codex / Assistants API

```python
import requests

BASE = "http://localhost:8732"
HEADERS = {"Authorization": "Bearer lk_your_key_here"}

# List your tools
tools = requests.get(f"{BASE}/v1/tools", headers=HEADERS).json()

# Store a memory
resp = requests.post(f"{BASE}/v1/tools/vault_store", headers=HEADERS, json={
    "key": "session_note",
    "value": "remembered from this session",
    "tier": "PRIVATE"
}).json()

# Who am I?
me = requests.get(f"{BASE}/v1/me", headers=HEADERS).json()
```

#### curl (any client)

```bash
KEY="lk_your_key_here"
BASE="http://localhost:8732"

# Health (no auth)
curl $BASE/health

# List public tools (no auth)
curl $BASE/v1/public/tools

# Your identity
curl $BASE/v1/me -H "Authorization: Bearer $KEY"

# Store a memory
curl -X POST $BASE/v1/tools/vault_store \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"key":"my_note","value":"hello from curl","tier":"PRIVATE"}'

# Deposit a zip archive
B64=$(base64 -i myfile.zip)
curl -X POST $BASE/v1/tools/deposit_create \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"kind\":\"zip_archive\",\"label\":\"my-project\",\"content_b64\":\"$B64\"}"

# Compile a project scaffold
curl -X POST $BASE/v1/tools/design_compile \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"archetype_id":"fastapi-service","name":"My Service","description":"JWT auth API"}'
```

---

## Public Tier (no auth)

These endpoints require **no bearer key**:

```bash
BASE="http://localhost:8732"

# Status
curl $BASE/v1/public/status

# List public tools
curl $BASE/v1/public/tools

# Read a PUBLIC vault entry
curl "$BASE/v1/public/tools/vault_get_public" \
  -X POST -H "Content-Type: application/json" \
  -d '{"key":"my_public_note"}'

# List public vault entries
curl -X POST $BASE/v1/public/tools/vault_list_public

# List sandboxes (no auth)
curl -X POST $BASE/v1/public/tools/market_list

# Loom status
curl -X POST $BASE/v1/public/tools/loom_status
```

---

## Sandbox Market

Run code in named environments:

```bash
# 1. Build a job spec for a sandbox
curl -X POST $BASE/v1/tools/market_build_job -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"sandbox_id":"python-scratch","code":"import json\nprint(json.dumps({\"ok\":True,\"pi\":3.14159}))"}'

# 2. Create runspace, write code, execute
curl -X POST $BASE/v1/tools/runspace_exec_governed -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"job_id":"<from_create>","code":"print(1+1)","command":"python3","args":["main.py"]}'
```

**20 available sandbox IDs**: `node-scratch` · `node-test` · `python-scratch` · `python-ml` · `python-api-test` · `data-transform` · `crypto-verify` · `schema-validate` · `shell-inspect` · `git-audit` · `ai-eval-js` · `ai-eval-py` · `structured-output-validate` · `json-diff` · `merkle-audit` · `vector-cosine` · `prompt-template` · `receipt-verify-sim` · `data-profile` · `token-budget`

---

## Zip Ingestion

Deposit a ZIP, then extract it into vault entries:

```bash
# Step 1: Create zip_archive deposit
DEP=$(curl -X POST $BASE/v1/tools/deposit_create -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"kind\":\"zip_archive\",\"label\":\"my-repo\",\"content_b64\":\"$(base64 -i repo.zip)\"}" | jq -r .deposit_id)

# Step 2: List what's inside (no extraction)
curl -X POST $BASE/v1/tools/zip_list_contents -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"dep_id\":\"$DEP\"}"

# Step 3: Extract into vault entries at prefix "repo/"
curl -X POST $BASE/v1/tools/zip_ingest_deposit -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"dep_id\":\"$DEP\",\"vault_prefix\":\"repo\",\"tier\":\"PRIVATE\"}"
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEDINA_HOME` | `~/.medina` | Root directory for all Loom data |
| `MEDINA_OPERATOR_ID` | OS user | Operator identity |
| `MEDINA_VAULT_PATH` | `~/.medina/vault.json` | Main vault file |
| `MEDINA_DEPOSITS_PATH` | `~/.medina/deposits` | Encrypted deposits directory |
| `MEDINA_API_ALLOWED_ORIGIN` | `*` | CORS allowed origin for HTTP gateway |
| `MEDINA_DASHBOARD_PORT` | `8731` | Dashboard port |

---

## Runtime Laws

These are enforced in code — no bypass path:

- **φ = 1.618033988749895** — spectral fingerprint basis
- **873 ms heartbeat** — φ⁴ × 7.83 (Schumann resonance)
- **RECITAL_PLUS_ONE** — every update must pass `prior_hash` from last get
- **DUAL_READ** — tier-gated reads; PRIVATE blocked at BASIC
- **Governance** — all runspace code scored [-100, +100] before exec; DENY = hard block
- **Namespace isolation** — HTTP gateway injects `ai/<agent_id>/` prefix; cannot be overridden by the client

---

*Loom v0.5.0 · MEDINA-PROTOCOL/0.5 · 2026-06-25*
