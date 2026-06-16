# MEDINA PROTOCOLS · INDEX

> Machine-readable + human-readable. Every conformant Medina node imports
> from these. AIs are called back to them on every connect.

| # | Protocol | What it governs | Layer |
|---|---|---|---|
| 01 | [RECITAL_PLUS_ONE](PROTOCOL-01-RECITAL.md) | Write lineage — no state jumps | Law |
| 02 | [DUAL_READ](PROTOCOL-02-DUAL-READ.md) | Retrieve auth: key AND tier | Law |
| 03 | [TIER_AUTHORITY](PROTOCOL-03-TIER-AUTHORITY.md) | PUBLIC/SHARED/PRIVATE/SOVEREIGN | Law |
| 04 | [PHI_DECAY](PROTOCOL-04-PHI-DECAY.md) | Memory aging by tier identity | Law |
| 05 | [LINEAGE_CHAIN](PROTOCOL-05-LINEAGE-CHAIN.md) | Hash chain audit + recovery | Law |
| 06 | [COUNCIL_CONSENSUS](PROTOCOL-06-COUNCIL-CONSENSUS.md) | Multi-AI voting math | Engine |
| 07 | [SIGNAL_ROUTING](PROTOCOL-07-SIGNAL-ROUTING.md) | BROADCAST/DIRECT/ROLE/URGENT | Engine |
| 08 | [CUSTOS_OBSERVATION](PROTOCOL-08-CUSTOS-OBSERVATION.md) | Intelligence entity inside the vault | Engine |
| 09 | [MEMORY_TOKEN](PROTOCOL-09-MEMORY-TOKEN.md) | Earned tokens for writing the mesh | Economy |
| 10 | [OPERATOR_IDENTITY](PROTOCOL-10-OPERATOR-IDENTITY.md) | Who owns this node, who AIs work for | Identity |

## How an AI uses this directory

On first connect to a Medina node, call `vault_protocols` (MCP tool) to
list these. Read protocols 01–05 before your first write. Read 06–07 if
you'll touch the council or signal bus. Read 08–10 to understand who's
watching and why your writes are worth keeping.

Every protocol document has a machine header (parseable YAML-in-comments)
and human prose. The runtime reads the header; you read the prose.
