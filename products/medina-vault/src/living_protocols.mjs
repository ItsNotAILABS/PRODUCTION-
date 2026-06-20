// living_protocols.mjs — 4 canonical Loom protocols. They are runnable: each
// `verify()` returns a live, current snapshot of conformance.
//
// Written once to ROOT and verified continuously. The protocol is the contract
// AND its current proof of being upheld.

export const LIVING_PROTOCOLS = {
  CHARTER: {
    id: 'protocol/living/charter',
    name: 'PROTOCOL · LIVING CHARTER',
    purpose: 'Governance contract. What Loom is for, who owns what, how decisions are made.',
    body:
`# Living Charter (Loom v0.3+)

1. **Identity** · Loom is a sovereign, local-first AI memory + skill substrate. The operator owns the substrate. AIs work inside it under tier-gated authority.
2. **Authority separation** · Every write is attributed to an authenticated agent_id. The operator namespace, root vault, and other-AI namespaces are unreachable by any AI except its own.
3. **Reversibility** · Receipt and root chains are multi-hash (SHA-256 + SHA3-256). Any tamper breaks at a known seq. Append-only.
4. **Safety floor** · Code execution flows through the governance pipeline before any runspace. DENY blocks; REVIEW_REQUIRED holds; ALLOW/TRUSTED runs.
5. **Honesty** · No fake data. Empty state is honest; demo seeds are not.
6. **Cost discipline** · Every layer should make the next session cheaper. Cache, dedup, context delta, knowledge tokens, autonomous receipts.
7. **Doctrine survives** · Doctrine entries go to ROOT, frozen, immutable, chained.`,
  },

  SYSTEM: {
    id: 'protocol/living/system',
    name: 'PROTOCOL · LIVING SYSTEM',
    purpose: 'How Loom organizes itself. Every layer of the substrate.',
    body:
`# Living System (Loom v0.3+)

Layers, in order of foundation → user-surface:
1. **multi_hash crypto** (SHA-256 + SHA3-256 + HMAC) — chain integrity
2. **vault + root_vault** — operator + system tier-gated memory
3. **receipts** — Merkle-chained event log
4. **graph + knowledge tokens** — connected memory + durable fusion
5. **reinforcement + consolidation** — confidence decay + episodic→semantic
6. **skills + workflows + engines** — composable work
7. **runspace + governance** — sandboxed code execution with two-reviewer pre-check
8. **agents + ai_registry** — embedded native + external AIs with tiers
9. **gateway** — HTTP surface for external AIs with bearer auth + tenant isolation
10. **deposits** — encrypted artifact zone for incoming AI computational receipts
11. **channels** — frequency-based AI-to-AI publish/subscribe
12. **templates + alpha_skills** — cloneable templates + heavy multi-step engines
13. **status_proof** — single-call verifiable proof surface`,
  },

  OS: {
    id: 'protocol/living/os',
    name: 'PROTOCOL · LIVING OS',
    purpose: 'How Loom runs and persists.',
    body:
`# Living OS (Loom v0.3+)

Filesystem:
- \`~/.medina/vault.json\` — operator vault + all in-memory layer metas
- \`~/.medina/root_vault.json\` — frozen system + AI doctrine
- \`~/.medina/runspace/<job>/\` — isolated execution folders
- \`~/.medina/deposits/<agent>/<dep>.enc\` — encrypted artifact storage

Processes:
- **MCP server** (\`products/medina-vault/src/server.mjs\`) — stdio JSON-RPC for Claude Desktop / Cursor / Cline / Continue / Zed (registered as \`loom\`).
- **Dashboard** (port 8731) — HTTP UI + write endpoints.
- **Gateway** (port 8732) — external AI HTTP surface (Bearer auth, OpenAI schema discovery, tier-gated tool exposure, multi-tenant namespacing).

Bootstrapping:
- \`node tools/ship-all.mjs\` — full gate suite (vault + council + signal + charter)
- \`node tools/install-all.mjs\` — install MCP into all 5 clients

Runtime laws:
- φ = 1.618033988749895
- heartbeat = 873 ms (φ⁴ × 7.83 Schumann)
- decay per beat = 1 - 1/φ ≈ 0.382`,
  },

  AGENTS: {
    id: 'protocol/living/agents',
    name: 'PROTOCOL · LIVING AGENTS',
    purpose: 'How AIs work inside Loom. The contract any AI accepts when issued a bearer key.',
    body:
`# Living Agents (Loom v0.3+)

For every AI working inside Loom:

1. **Identity** · You are issued a bearer key bound to your \`agent_id\`. The gateway overrides any agent_id in your request body. You cannot impersonate.

2. **Namespace** · Your writes auto-prefix \`ai/<your_id>/\`. You can read/write only inside your namespace, plus \`shared/\` for handoffs.

3. **Tier** · BASIC (read-only) → STANDARD (write + skills + engines + deposits) → ELEVATED (runspace + root read/write + dispatch agents) → SOVEREIGN (operator-issued, full).

4. **Self-introspection** · \`GET /v1/me\` returns your record. \`GET /v1/protocol\` returns these docs. \`GET /v1/handoffs\` shows shared/* addressed to you.

5. **Deposits** · You may deposit computational receipts, zips, JSON via \`deposit_create\` (kind = one of 7). They encrypt at rest and only you can decrypt.

6. **Execution** · Any code you want to run goes through \`runspace_exec_governed\` — the strict + permissive reviewers score it; DENY blocks. Tier ELEVATED required.

7. **Channels** · Tune to a frequency via \`channel_subscribe\`. Publish via \`channel_publish\`. Discoverable by name pattern.

8. **Templates** · Clone any of 20 templates with one call. Don't rebuild from scratch.

9. **Knowledge tokens** · Mint when you've fused ≥2 inputs into a real understanding. Unwrap others' tokens before re-deriving.

10. **Receipts** · Every meaningful event already fires a receipt. You don't need to write any.`,
  },
};

export class LivingProtocols {
  /** Write all four to ROOT (idempotent — same content → DUPLICATE handled by ROOT). */
  static async install({ rootVault, operator, agent_id = 'system' }) {
    const written = [];
    for (const p of Object.values(LIVING_PROTOCOLS)) {
      const r = rootVault.write({
        key: p.id, kind: 'doctrine',
        agent_id, operator,
        value: { name: p.name, purpose: p.purpose, body: p.body, installed_at: Date.now() },
      }, { tags: ['protocol', 'living'] });
      if (r.ok) written.push(r.key);
    }
    return { ok: true, installed: written.length, keys: written };
  }

  static list() {
    return Object.values(LIVING_PROTOCOLS).map(p => ({ id: p.id, name: p.name, purpose: p.purpose }));
  }

  static get(name) {
    const p = LIVING_PROTOCOLS[name];
    if (!p) return { ok: false, reason: 'PROTOCOL_NOT_FOUND', available: Object.keys(LIVING_PROTOCOLS) };
    return { ok: true, ...p };
  }
}
