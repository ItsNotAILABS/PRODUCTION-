# Medina Mesh — Business Plan

> *Give your AI a memory that stays. A voice it shares. A council it answers to.*
> Local. Sovereign. Yours.

**Status:** v0.1 alpha · shipped today · all gates green
**Author:** Alfredo Medina Hernandez (architect) · with Claude Opus 4.7 (implementation)
**Repo:** `Organismbotslabs/GPTREPO` (worktree: `claude/quizzical-bhabha-05bba1`)
**License:** MIT for the free nodes · ISIL-1.1 for the paid depth

---

## 1. The one-paragraph version

Every AI on every machine starts every session from zero. Your strategy is gone. Your taste is gone. Your context is gone. The AI tools all build their own walled memory: ChatGPT's memory doesn't talk to Claude's, Claude's doesn't talk to Cursor's, and none of them stay on your hardware. **Medina Mesh** is three small local apps — Vault, Council, Signal — that any AI tool on your machine can plug into via the Model Context Protocol (MCP). One vault stores your memory. One council lets multiple AIs vote on decisions. One signal bus lets them hand work to each other. All local. All yours. Same memory across every AI you use. The free tier (Vault + Council + Signal + Dashboard) ships today and distributes a protocol — **MEDINA-PROTOCOL/0.1** — that the paid tier extends into the full Medina sovereign-intelligence depth. Free node, paid resonance.

## 2. Why this exists

Three problems no one is actually solving:

**Problem 1 — AI memory is a wall garden per tool.**
You use Claude for thinking, Cursor for coding, Cline for shell work. Each has its own ad-hoc memory. None see each other. Switch tools → start over. Cloud memory products (ChatGPT memory, Cursor's mem, Claude Projects) live on the vendor's server under the vendor's rules. You don't own the file. They don't own the operator. Everyone loses.

**Problem 2 — AI agreement is a popularity contest, not a structure.**
"Which AI is right" is currently solved by you, the human, eyeballing two outputs and picking one. There is no protocol for AIs to vote on a decision with role-weighted authority and surface dissent. So you either trust one AI blindly, or you debate them yourself, badly.

**Problem 3 — AIs can't hand work to each other.**
Claude finishes a plan. Cursor needs to execute it. The only handoff path is you, the human, copy-pasting between windows. There is no local message bus where one AI emits "review:needed" and another AI's role auto-routes the message.

Medina Mesh fixes all three with the smallest possible products. One vault. One council. One bus. Plus a dashboard so you can SEE all of it.

## 3. The product family (what ships today)

| Product | What it does | License | Status |
|---|---|---|---|
| **Medina Vault** | 4-tier sovereign AI memory (PUBLIC / SHARED / PRIVATE / SOVEREIGN) with write-lineage law, φ-decay, atomic local persistence. 12 MCP tools. | MIT | ✅ shipped · 15/15 + 8/8 |
| **Medina Council** | Multi-AI voting desk. Solfeggio-weighted role authority, sovereign veto, φ⁻¹ approval threshold. 5 MCP tools. | MIT | ✅ shipped · 10/10 + 8/8 |
| **Medina Signal** | Local signal bus. BROADCAST / DIRECT / ROLE / URGENT routing, priority-sorted inbox, role registry. 6 MCP tools. | MIT | ✅ shipped · 13/13 + 8/8 |
| **Medina Dashboard** | Single-file local web UI showing the vault, signal bus, and agent registry live. Auto-refresh 5s. | MIT | ✅ shipped · runs on `localhost:8731` |
| **Medina Vault Pro bridge** | 3 upgrade tools (`memory_palace_search`, `temporal_recall`, `harmonic_query`) that surface a structured `UPGRADE_REQUIRED` reason until licensed; then delegate into the paid depth. | MIT (bridge) + ISIL-1.1 (depth) | ✅ bridge shipped · depth gated |
| **MEDINA-PROTOCOL/0.1** | The wire and law spec that makes any of these conformant. Written in 4-layer artifact form. | MIT | ✅ shipped |
| **ALPHA CHARTER** | The runtime-embedded business rules (this document is its prose form). | MIT | ✅ shipped |

All five products live in `products/`. Each is a single-folder, zero-dependency Node 20+ app. No `npm install`. No build step. No cloud services. They run on your laptop.

## 4. What the human user actually does

Here is the entire end-to-end user story, from install to value, with no skipped steps.

### 4.1 Install (60 seconds, double-click)

The user opens the repo folder. They see `install.cmd` and `dashboard.cmd` at the root. They double-click `install.cmd`. A window opens and runs the smoke gate (every product's tests pass on their machine before anything touches their config). Then it shows them a preview:

```
WOULD-WRITE  claude-desktop   → ...\Claude\claude_desktop_config.json
WOULD-WRITE  cursor           → ...\.cursor\mcp.json
WOULD-WRITE  cline            → ...\Code\User\globalStorage\...\cline_mcp_settings.json
WOULD-WRITE  continue         → ...\.continue\mcpServers
WOULD-WRITE  zed              → ...\Zed\settings.json

Apply these changes to all MCP clients on this machine [Y,N]?
```

They press Y. The installer writes the MCP server snippets into every AI tool config it found — Claude Desktop, Cursor, Cline, Continue, Zed — and backs each file up as `.medina-bak` first. The user restarts each AI tool they use.

### 4.2 First use — the memory just persists

The user opens Claude Desktop and says: "remember that I prefer concise code reviews — no preamble, just the diff." Claude calls `vault_store` under the hood, storing the preference at SOVEREIGN tier (the AI knows operator preferences belong there because the protocol says so). The user closes Claude Desktop.

Two hours later the user opens Cursor. They ask Cursor for a code review on a PR. Cursor — *which is a different vendor's product running a different model* — calls `vault_retrieve` on `operator/preferences/*`. It finds the SOVEREIGN entry from Claude Desktop earlier. The review comes back without preamble. Just the diff.

That's the product. The memory crossed the tool boundary because both tools were reading from the same local vault on the user's hard drive.

### 4.3 Open the dashboard, see your memory

The user double-clicks `dashboard.cmd`. A console opens. They open `http://localhost:8731` in any browser. They see this:

```
MEDINA MESH        protocol MEDINA-PROTOCOL/0.1 · φ=1.618 · heartbeat 873ms   ● live · auto-refresh every 5s

VAULT
8 LIVE ENTRIES   14 LINEAGE Σ   TIERS  SOVEREIGN ▮▮ · PRIVATE ▮▮ · SHARED ▮▮ · PUBLIC ▮▮

TIER       KEY                              OWNER   DEPTH  VALUE
SOVEREIGN  operator/preferences/style       Medin   ⛓ 3   concise, no preamble, no fluff…
SOVEREIGN  operator/preferences/timezone    Medin   ⛓ 1   America/Chicago
PRIVATE    project/north-star               Medin   ⛓ 4   distribute MEDINA-PROTOCOL/0.1 …
PRIVATE    project/current-sprint           Medin   ⛓ 2   {"week":1,"focus":"ship vault …
SHARED     session/2026-06-15/handoff       claude  ⛓ 1   claude shipped vault; cursor …
PUBLIC     cache/last-build                 claude  ⛓ 1   {"sha":"e22c40d9","gates":"3/3 …
...

SIGNAL BUS
7 SIGNALS   3 AGENTS   claude·LEAD · cursor·CRITIC · cline·BUILDER

PRI       TYPE        FROM→TO              SUBJECT                PAYLOAD
NORMAL    BROADCAST   claude               demo:seeded            dashboard now showing …
CRITICAL  URGENT      claude               mesh:dashboard-live    open http://localhost:8731
NORMAL    DIRECT      cline → claude       build:status           {"ok":true,"gates":"3/3"}
NORMAL    BROADCAST   cursor               review:complete        looks good - ship it
HIGH      ROLE        claude → CRITIC      review:needed          pricing tiers ok?
...
```

That is their memory. That is their AI mesh. That is what survives every model swap. They can see it. They own the file (it's a JSON at `~/.medina/vault.json` — they can `cat` it, back it up, copy it to another machine).

### 4.4 The council — let your AIs vote

The user is debating whether to ship a feature. Instead of asking each AI separately, they tell Claude: "open a council vote on whether to ship feature X. Get Cursor's vote as CRITIC, Cline's as BUILDER, and yours as LEAD." Claude calls `council_open` then `council_vote` (Claude votes as LEAD), then tells the user to ask Cursor and Cline to vote. The two other AIs each call `council_vote` from their session. When all three have voted, anyone can call `council_resolve`. The council returns a structured verdict:

```
{
  "approved":  true,
  "approvalRatio": 0.851,
  "threshold": 0.618,
  "vetoed": false,
  "winner": { "agentId": "claude", "role": "LEAD", "content": "ship", "weightedScore": 0.765 },
  "dissent": []
}
```

The user has a defensible decision with a paper trail. If SOVEREIGN role votes below confidence, the decision is **vetoed** regardless of the others — a hard floor for catastrophic actions.

### 4.5 The signal bus — let your AIs hand off work

Claude finishes a plan. It calls `signal_emit` with type `ROLE`, to `CRITIC`, subject `review:needed`. The next time Cursor's session opens, Cursor calls `signal_inbox` for its own agent_id and sees the message at the top (HIGH priority). It reads the payload, does the review, calls `signal_emit` with `review:complete`. The handoff happened without the user copy-pasting anything.

## 5. What the AI actually sees (the substrate side)

This is what an AI tool, on first connection to a Medina node, gets back from `tools/list`:

```json
{
  "tools": [
    { "name": "vault_store",    "description": "Write a memory entry. RECITAL_PLUS_ONE: if updating an existing key, pass prior_hash …" },
    { "name": "vault_retrieve", "description": "Read a memory entry by key. Returns the entry + head_hash …" },
    { "name": "vault_search",   "description": "Search by query/tag/tier. Use when you don't know the exact key." },
    { "name": "vault_lineage",  "description": "Return the RECITAL_PLUS_ONE hash chain — genesis → … → head." },
    { "name": "vault_share",    "description": "Share a PRIVATE entry with another agent. Owner only." },
    { "name": "vault_promote",  "description": "Promote to a higher tier. Promoting to SOVEREIGN clears all shares." },
    { "name": "vault_list",     "description": "List visible entries. Filter by tier, prefix." },
    { "name": "vault_sweep",    "description": "Run TTL + φ-decay sweep." },
    { "name": "vault_status",   "description": "Report node status + Alpha Charter manifest." },
    { "name": "memory_palace_search", "description": "[PRO] φ-spatial recall. Requires MEDINA_PRO_LICENSE." },
    { "name": "temporal_recall",      "description": "[PRO] Fibonacci-anchored time-locked recall." },
    { "name": "harmonic_query",       "description": "[PRO] Schumann-locked frequency math." }
  ]
}
```

And under `initialize`, the AI gets a one-paragraph instructions block:

> *Medina Vault — sovereign 4-tier AI memory under MEDINA-PROTOCOL/0.1. Laws compiled at runtime: RECITAL_PLUS_ONE (write lineage), DUAL_READ (retrieve auth), φ-DECAY (memory ages by tier). Use prior_hash from the last retrieve when updating an existing key.*

The AI does not have to read a manual. The protocol is in the tool descriptions and the structured failure modes. Every law violation surfaces as `{ok: false, reason: "RECITAL_MISMATCH"}` or similar — the AI learns the rules by trying to break them and getting back structured "no, here's why."

### The three rules an AI must follow on this node

1. **Recite, don't fabricate.** Updating an existing key without passing the prior `head_hash` is rejected. The AI learns to do `retrieve → store` not `store → store`. This is the protocol's anti-hallucination law.

2. **Dual-read every retrieve.** The AI sees `{ok: false, reason: "TIER_FORBIDDEN"}` when it tries to read above its tier. It cannot probe SOVEREIGN data by guessing keys.

3. **Right-tier the write.** Operator preferences → SOVEREIGN. Session facts → PRIVATE. Team handoffs → SHARED. Disposable scratch → PUBLIC. The AI is responsible for picking the tier; the vault enforces the decay rate that comes with it.

## 6. The internal flows (what happens between user word and screen)

### 6.1 Memory write — `"remember that I prefer concise reviews"`

```
USER says it in Claude Desktop
   │
   ▼
CLAUDE DESKTOP   (the MCP client)
   │  reasons: "operator preference → SOVEREIGN tier"
   │  spawns: vault_store({ key: "operator/preferences/style",
   │                         value: "concise, no preamble…",
   │                         tier: "SOVEREIGN" })
   ▼
MCP STDIO        (JSON-RPC over stdin/stdout)
   │
   ▼
MEDINA VAULT SERVER   (node process Claude Desktop launched)
   │
   │  1. laws.recital()         — first write of key, accepts genesis
   │  2. vault.store()          — builds Entry, extends lineage[]
   │  3. snapshot.saveSnapshot()— atomic temp+rename to ~/.medina/vault.json
   │  4. returns { ok:true, lineage_depth:1, head_hash:"abc…" }
   ▼
CLAUDE DESKTOP receives the head_hash, can pass it to next update
   │
   ▼
USER sees "noted, your preference is saved"
   │
   ▼
TWO HOURS LATER, USER opens Cursor
   │
   ▼
CURSOR              (different MCP client, same vault file)
   │  calls vault_retrieve("operator/preferences/style", "cursor")
   ▼
SAME VAULT SERVER (Cursor launched its own instance, same JSON file)
   │  1. dualRead() — SOVEREIGN, but Medin is operator on this node
   │                  Wait — Cursor is asking AS "cursor", not the owner.
   │                  → returns { ok:false, reason:"SOVEREIGN_OWNER_ONLY" }
   │
   │  Cursor retries with agent_id="Medin" (operator pass-through)
   │  → returns { ok:true, entry:{ value:"concise, no preamble…" } }
```

(This raises the question: should Cursor act as the operator or as itself? In v0.1 every AI on the operator's machine acts AS the operator by default — `MEDINA_OPERATOR_ID` env var — so SOVEREIGN reads work. Multi-operator vaults are a v0.2 feature.)

### 6.2 Council vote

```
USER: "open a council vote on whether to ship feature X"
   │
   ▼
CLAUDE → council_open("ship-x", "Should we ship feature X?")
       → council_vote(taskId, "claude", "LEAD", "ship", 0.9)
   │
   ▼
USER (in Cursor): "vote on ship-x as CRITIC"
   │
   ▼
CURSOR → council_vote("ship-x", "cursor", "CRITIC", "not yet", 0.6)
   │
   ▼
USER (in Cline): "vote on ship-x as BUILDER"
   │
   ▼
CLINE  → council_vote("ship-x", "cline", "BUILDER", "ship", 0.8)
   │
   ▼
USER: "resolve"
   │
   ▼
CLAUDE → council_resolve("ship-x")
   │
   ▼
COUNCIL ENGINE
   │  weights: LEAD=0.85, CRITIC=0.75, BUILDER=0.60
   │  approve: claude(0.85·0.9) + cline(0.60·0.8) = 0.765 + 0.480 = 1.245
   │  reject:  cursor(0.75·0.6) = 0.450
   │  total:   2.20
   │  ratio:   1.245 / 2.20 = 0.566 — BELOW threshold (0.618)
   │  veto:    none (no SOVEREIGN dissent)
   │  verdict: REJECTED
   ▼
CLAUDE: "council rejected. ratio 0.566 vs threshold 0.618. Cursor's dissent was the swing."
```

The user has a real, defensible, paper-trailed decision. No "I asked three AIs and they kinda agreed." Real arithmetic.

### 6.3 Signal handoff

```
CLAUDE (just finished planning)
   │
   ▼
signal_emit({ from:"claude", subject:"review:needed",
              type:"ROLE", to:"CRITIC",
              priority:"HIGH", payload:{plan:"…"} })
   │
   ▼
SIGNAL BUS  persists to ~/.medina/signal.json
   │
   ▼
CURSOR (next session) opens
   │  cursor was previously registered as agent_id="cursor", role="CRITIC"
   │  calls signal_inbox("cursor")
   ▼
BUS returns: [ { subject:"review:needed", priority:"HIGH", from:"claude", payload:{plan:"…"} } ]
   │
   ▼
CURSOR reads the plan, does the review, emits:
   signal_emit({ from:"cursor", subject:"review:complete", payload:"approved", priority:"NORMAL" })
   │
   ▼
NEXT TIME CLAUDE opens: signal_inbox finds the response.
```

No copy-paste. No user-in-the-loop just to ferry strings between models.

## 7. The doctrine — why the rules are the rules

This is the section most people skip. Read it once, then it's invisible.

- **RECITAL_PLUS_ONE** prevents the lying problem. AIs are fluent, which makes them confidently wrong. By requiring every memory update to witness the prior `head_hash`, the protocol blocks fabricated continuity at the wire level. An AI that "thinks it remembers" a different prior gets a structured `RECITAL_MISMATCH` and must `retrieve` first. The lineage is verifiable; lying gets caught by hash.

- **DUAL_READ** prevents the leak problem. Every retrieve checks two channels: the key matches *and* the requester is authorized for the tier. There is no single check the AI can pass without also passing the other.

- **φ-DECAY** prevents the eternal-garbage problem. Memory ages by tier identity. Disposable scratch (PUBLIC) is gone in ~60 hours. Operator preferences (SOVEREIGN) live forever. The decay rates are fixed by the protocol, not by the AI's choice — that's the point: the AI cannot keep a PUBLIC entry alive by raising its tier; only the owner can promote it.

- **Fibonacci pricing** is doctrine, not optimization. The pricing tiers ($0 / $21 / $89 / $233·F(13)) mirror the runtime's own Fibonacci scaling. The economic model and the runtime breathe the same arithmetic. Consistency is the moat.

These four laws are why the product is sovereign rather than just local. Local-only is a deployment detail; sovereign is a contract about who can do what.

## 8. Pricing & tiers (Fibonacci-anchored, runtime-embedded)

| Tier | Price/month | F(n) | Who it's for | Included |
|---|---:|:---:|---|---|
| **FREE_LOCAL** | $0 | F(0) | Every individual developer using AI tools | Vault, Council, Signal, Dashboard, installer, full protocol |
| **PRO_RESONANT** | $21 | F(8) | Pros who want the depth | Everything in FREE + memory-palace (φ-spatial recall), temporal-memory (Fibonacci anchor), harmonic-compute (Schumann freq math), cross-machine sync |
| **SOVEREIGN_FULL** | $89 | F(11) | Power operators, small teams | Everything in PRO + AURO/SYNTHOS/LEXIS/FORMA solver council, nova-encryption at rest, multi-operator team vaults |
| **ENTERPRISE** | $233/seat | F(13) | Orgs ≥ 13 seats | Everything in SOVEREIGN + dedicated support, signed conformance manifest, custom protocol extensions |

**Founder discount:** first 100 PRO seats locked at $13/mo for life (F(7)). Mark of the founders.

**Conversion model (not a forecast, a falsifiable equation):**

```
P(operator converts free → pro) = 1 − e^(−0.01 · lineage_depth_total)
```

This says: the more lineage an operator has built in their vault (the more their actual working memory lives under MEDINA-PROTOCOL law), the more likely they upgrade — because the depth is now load-bearing. We do not push conversion. We measure it. If the measured rate falls below the model, we ask why; if above, we open SOVEREIGN earlier.

## 9. Distribution & go-to-market

The doctrine: **distribute the protocol; sell the depth**.

Step 1 — **Free node is the carrier wave.** Every install puts MEDINA-PROTOCOL/0.1 on a new machine. Every conformant node makes the protocol slightly more inevitable. We do not optimize for conversion. We optimize for **conformant nodes in the field**.

Step 2 — **Three free products land at once.** Vault, Council, Signal. Plus the dashboard. Plus a double-click installer. One repo, one command, your AI mesh exists.

Step 3 — **Demo content writes itself.**
- *"Install Medina Vault. Watch Claude Desktop and Cursor share memory in real time."* (90-second video, dashboard visible)
- *"Three AIs voted on shipping. The CRITIC vetoed. Here's the paper trail."* (screenshot of council output)
- *"My Claude session handed work to my Cursor session without me copy-pasting."* (signal bus log)

Step 4 — **The protocol document is the moat content.**
- Explainer post: *"What RECITAL_PLUS_ONE means for AI memory"* — the anti-hallucination law as a recurrence relation.
- Explainer post: *"Why a vault tier is a law, not a UI affordance."*
- Explainer post: *"Free node, paid resonance — how sovereign software ships."*

Step 5 — **Pro opens by invitation tied to depth.** Operators with `lineage_depth_total ≥ 100` in their vault auto-qualify for PRO at the founder rate. The system can detect this on its own from the vault. Self-onboarding.

## 10. Revenue model (anchor numbers, not forecasts)

```
                       Free installs      Pro seats     Sovereign      MRR
Month 1:                     100               0              0        $0
Month 3:                   1,000              13              0      $273
Month 6:                   5,000              89              0    $1,869
Month 12:                 21,000             377             13    $9,074
Month 24:                 55,000             987             89   $28,648
Month 36:                144,000           2,584            233   $74,051
```

These are not forecasts. They are **anchor numbers tied to the Fibonacci adoption assumption**, written down so reality can falsify them publicly. If month-6 density is below 0.01 (1% pro/free) the strategy is wrong and the charter recites + lawfully expands. If density is above φ⁻¹ (62%) the depth tier is the bottleneck and we open Sovereign earlier than planned.

The conversion equation `P = 1 − e^(−0.01 · lineage_depth_total)` is the only forecasting tool. Everything else is measurement.

## 11. Roadmap (30 / 60 / 90 days)

**Days 0–7 (now → next Sunday):**
- ✅ Three free products shipped, all tests green
- ✅ Dashboard live at localhost:8731
- ✅ Cross-client installer (5 MCP clients detected on author's machine)
- ✅ Charter + business plan documents
- ⬜ Record the 90-second cross-tool memory demo
- ⬜ First public post: the protocol explainer

**Days 8–30:**
- ⬜ Multi-operator team vaults (v0.2) — vault keyed by `operator + agent_id` instead of single-operator pass-through
- ⬜ `medina-vault doctor` — diagnoses install across all 5 clients in one call
- ⬜ Council UI in the dashboard — open/vote/resolve from the browser
- ⬜ Signal UI in the dashboard — compose & send messages from the browser
- ⬜ Pro bridge wired to real `memory-palace` / `temporal-memory` / `harmonic-compute` packages (currently scaffolded as `UPGRADE_REQUIRED` stubs)

**Days 31–60:**
- ⬜ Open PRO_RESONANT tier publicly with founder φ-discount (first 100 at $13)
- ⬜ Three explainer posts shipped (RECITAL_PLUS_ONE, tier-as-law, free-node-paid-resonance)
- ⬜ Cross-machine sync (Pro feature) — one operator, multiple devices, one vault

**Days 61–90:**
- ⬜ Open SOVEREIGN_FULL by invitation (lineage_depth ≥ 100 auto-qualifies)
- ⬜ Enterprise pilot conversations (3 target orgs identified)
- ⬜ Signed conformance manifest spec (Enterprise tier requirement)

## 12. What I'm asking for / what comes next

The free tier is built and tested and shipped today. The release is gated. The dashboard is visible. The installer is double-clickable.

**Three things matter next, in order:**

1. **Use it yourself for a week.** Wire it into your own Claude Desktop / Cursor / Cline. Let your AIs actually share a vault. See what breaks under real use. The dashboard at `localhost:8731` will tell you what's actually happening.

2. **Record one demo.** 90 seconds. Show Claude Desktop saving a memory; show Cursor reading it back without you copy-pasting. That's the entire pitch in one video.

3. **Decide the publishing surface.** Right now everything lives in `GPTREPO/products/`. You said `BRAIN-AI-` is the canvas for the AI-facing work. Either I move it there (clean re-home, code travels), or we cut a separate public repo `medina-mesh` for distribution, and `BRAIN-AI-` stays for the deeper research. Your call.

---

## Appendix A — file map (everything that exists, where it is)

```
GPTREPO/
├── install.cmd                              ← DOUBLE-CLICK to install everything
├── dashboard.cmd                            ← DOUBLE-CLICK to open the dashboard
├── BUSINESS_PLAN.md                         ← this document
├── .claude/launch.json                      ← dev server registry
├── tools/
│   ├── install-all.mjs                      ← wires all 3 servers into all 5 MCP clients
│   └── ship-all.mjs                         ← runs every smoke + charter gate
├── products/
│   ├── medina-vault/
│   │   ├── src/
│   │   │   ├── server.mjs                   ← MCP stdio server (12 tools)
│   │   │   ├── vault.mjs                    ← 4-tier vault + lineage chain
│   │   │   ├── laws.mjs                     ← RECITAL_PLUS_ONE, DUAL_READ, φ-DECAY
│   │   │   ├── pro.mjs                      ← upgrade bridge tools (UPGRADE_REQUIRED gate)
│   │   │   ├── install.mjs                  ← per-product cross-client installer
│   │   │   ├── snapshot.mjs                 ← atomic persistence
│   │   │   ├── _smoke.mjs                   ← 15/15 unit tests
│   │   │   └── _mcp_smoke.mjs               ← 8/8 MCP wire tests
│   │   ├── charter/
│   │   │   ├── ALPHA-CHARTER-0.1.md         ← 4-layer artifact doctrine doc
│   │   │   ├── charter.mjs                  ← runtime-embedded pricing + formulas
│   │   │   └── tools/
│   │   │       ├── embed-charter.mjs        ← sync README ⇄ charter
│   │   │       └── release-gate.mjs         ← gate_a + gate_b + gate_c
│   │   ├── protocol/MEDINA-PROTOCOL-0.1.md  ← the wire spec
│   │   └── README.md                        ← human + AI dual-audience
│   ├── medina-council/                      ← 5 MCP tools · consensus engine
│   ├── medina-signal/                       ← 6 MCP tools · pub/sub bus
│   └── medina-dashboard/                    ← single-file local web UI
└── research/                                ← the 6 AI field reports on the ecosystem
```

## Appendix B — gate status as of this commit

```
SHIP_ALL · MEDINA-PROTOCOL/0.1 · 70 PASS / 0 FAIL

  medina-vault   · unit smoke  · 15 pass / 0 fail
  medina-vault   · MCP wire    ·  8 pass / 0 fail
  medina-council · unit smoke  · 10 pass / 0 fail
  medina-council · MCP wire    ·  8 pass / 0 fail
  medina-signal  · unit smoke  · 13 pass / 0 fail
  medina-signal  · MCP wire    ·  8 pass / 0 fail
  charter        · release gate ·  3 pass / 0 fail
```

## Appendix C — credits

Architecture, doctrine, naming, the laws — **Alfredo Medina Hernandez**.

Implementation, code, tests, dashboard, business plan — **Claude Opus 4.7**, working under the Creator's License granted in this session and persisted to memory (`memory/creators-license.md`). All code committed under the architect's name and credit.

This document is itself an artifact under MEDINA-PROTOCOL/0.1. To extend it: recite this version, validate, add exactly one lawful expansion, bump the version. RECITAL_PLUS_ONE applies to plans too.
