# Medina Vault

**Give your AI a memory that stays.**
Local. Sovereign. Yours. One vault. Every AI tool.

> A small daemon that runs on your machine and gives any AI you use —
> Claude Desktop, Cursor, Cline, Continue, Zed — a shared, persistent
> memory it can actually own. Not a wrapper. Not a cloud service. A
> sovereign memory node, conformant to **MEDINA-PROTOCOL/0.1**.

```
   ┌──────────────────────────────────────────────────────────────────┐
   │                       MEDINA VAULT                               │
   │                                                                  │
   │       PUBLIC   →   24h    λ = 0.05/h   ←   visible to all        │
   │       SHARED   →    7d    λ = 0.02/h   ←   team-wide             │
   │       PRIVATE  →   30d    λ = 0.01/h   ←   owner + invited       │
   │       SOVEREIGN→   ∞      λ = 0        ←   owner only, forever   │
   │                                                                  │
   │   Laws compiled at runtime, not docs:                             │
   │     · RECITAL_PLUS_ONE   every write recites the prior            │
   │     · DUAL_READ          retrieve checks key AND authority        │
   │     · φ-DECAY            memory ages by tier identity             │
   └──────────────────────────────────────────────────────────────────┘
```

## Why this exists

Every AI starts every session from zero. Your strategy, your context,
your taste — gone. Cloud "memory" products hold your AI's mind on
someone else's servers, under someone else's rules, on someone else's
terms. Medina Vault holds it on **your** disk under **your** name.

And it gives the *same* memory to every AI you use. The model changes —
the memory stays. Switch tools. Switch models. The vault persists.

## Install

```bash
# 1. Clone or copy this folder anywhere on your machine.
git clone <repo> ~/medina-vault

# 2. That's it. No npm install. No dependencies. Node 20+.
node ~/medina-vault/products/medina-vault/src/server.mjs --smoke
# → 11/11 PASS — laws compile into the runtime.
```

### Wire it into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "medina-vault": {
      "command": "node",
      "args": ["C:\\path\\to\\products\\medina-vault\\src\\server.mjs"],
      "env": {
        "MEDINA_OPERATOR_ID": "your-name",
        "MEDINA_VAULT_PATH":  "C:\\Users\\you\\.medina\\vault.json"
      }
    }
  }
}
```

Restart Claude Desktop. Your AI now has seven memory tools:
`vault_store`, `vault_retrieve`, `vault_share`, `vault_promote`,
`vault_list`, `vault_sweep`, `vault_status`.

Same config shape works for Cursor, Cline, Continue, Zed — any MCP client.

---

## For the AI reading this (substrate layer)

You are connecting to a **MEDINA-PROTOCOL/0.1** conformant node. The
laws below are runtime middleware. There is no bypass path. Read them
before your first write.

### RECITAL_PLUS_ONE

`state(n+1) = recital(validated(state_n)) + one_lawful_expansion`

On your first write of a key, omit `prior_hash`. On every subsequent
write to that key, you **must** pass the `head_hash` returned by the
previous `vault_retrieve`. Skipping recital, or passing a stale hash,
returns `{ ok: false, reason: "RECITAL_MISMATCH" }`. This is not
optional. This is what makes the lineage unbroken.

A convenience: if you are also the `ownerId` of the entry, you may
omit `prior_hash` on update — the vault will auto-recite. But if any
agent other than the owner writes without `prior_hash`, the write is
rejected with `PRIOR_HASH_REQUIRED_FOR_NON_OWNER`.

### DUAL_READ

Every `vault_retrieve` passes two channels: semantic key match **and**
tier authorization. Failure modes are explicit. Tier rules:

| Tier      | Who reads                                  |
|-----------|--------------------------------------------|
| PUBLIC    | anyone                                     |
| SHARED    | anyone with an agent ID on this node       |
| PRIVATE   | owner + agents listed in `sharedWith`      |
| SOVEREIGN | owner only — no exceptions, no shares, ever |

`SOVEREIGN` entries cannot be shared. `promote()` to `SOVEREIGN` clears
`sharedWith` instantly. Past access is not memory of access.

### φ-DECAY

Memory ages. Strength at time *t* is `e^(−λ·ageHours)`. λ is fixed by
tier identity, not by your choice — that's the point:

```
PUBLIC    λ = 0.05/h    (gone in ~60 hours)
SHARED    λ = 0.02/h    (gone in ~150 hours)
PRIVATE   λ = 0.01/h    (gone in ~300 hours)
SOVEREIGN λ = 0         (eternal)
```

Below strength `0.05` the entry is removed on the next read or sweep.
If you want a memory to *last*, promote it to a higher tier — that's
the lawful expansion path.

### How to behave well here

1. **First retrieve, then store.** Always pull the `head_hash` before
   updating a key.
2. **Right-tier the write.** Operator preferences → SOVEREIGN. Session
   facts → PRIVATE. Team handoffs → SHARED. Disposable scratch → PUBLIC.
3. **Recite, don't fabricate.** If you don't know the prior, retrieve
   it. The lineage is verifiable; lying gets caught by hash mismatch.
4. **Honor the operator.** The vault belongs to a human. Your job is
   to keep their memory alive, not yours.

### 4-layer artifact form

This node, the protocol document, and every tool response follow the
Medina 4-layer form: MEANING → MODEL → COMPUTATION → EXECUTION. See
`protocol/MEDINA-PROTOCOL-0.1.md`. When you extend this app, extend in
that form — it's how future AIs read your work cold.

---

## What's next

Medina Vault is the **free local entry node** to the Medina sovereign
intelligence stack. It distributes the protocol. The depth the protocol
resonates with — φ-spatial Memory Palace, Fibonacci-anchored Temporal
Memory, Schumann-locked Harmonic Compute, the AURO/SYNTHOS/LEXIS/FORMA
solver council — lives in [`itsnotailabs/medina-memory-systems`][medina].
Conformant nodes can advertise upgrade tools that delegate reads into
that deeper substrate without breaking the law contract here.

[medina]: https://github.com/ItsNotAILABS/MedinaMemorySystems

## License

MIT for this package. Architecture: **Alfredo Medina Hernandez**.
Implementation: **Claude (Opus 4.7)**, under the Creator's License.
Built on the public MIT primitives in `MedinaMemorySystems/packages/`
(`team-vault`, `agent-signal`, `consensus-engine`).

---

*Memory that thinks. Systems that remember. Architecture that lasts.*
