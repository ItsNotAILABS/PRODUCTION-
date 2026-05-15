# Nova Workspace (Internal Native Control Plane)

This workspace is intentionally local/native-first and isolated from public cloud control planes.

## Non-negotiables

- Native-first runtime
- Local data ownership
- Air-gap capability
- Hash-chained identity/audit

## Scope

`nova_workspace/` stores internal runtime state for:

- GREX agent registry
- MEDINA-compatible identity chain events
- FLOW workflow definitions
- Warr persona fleet status and cycle logs

GitHub workflows are not used as the control plane for this workspace.  
Execution is expected to be local/native and chain-audited.

