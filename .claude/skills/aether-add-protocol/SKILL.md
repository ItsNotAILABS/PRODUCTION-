---
name: aether-add-protocol
description: Use this skill when the user wants to add a new intelligence protocol core to the Aether Sovereign Platform — a new deployable unit like a finance signal processor, federation mesh, AI evaluator, or any other protocol in the PROTO-XXX-NNN family. Triggers on requests like "add a new protocol for X", "create a protocol core", "I want more protocols", or "build a protocol for [some vertical]".
---

# Adding a New Aether Protocol Core

There are currently 16 registered protocols spanning federation,
orchestration, finance, AI evaluation, infrastructure codegen, and
content generation. A new protocol must be registered in **three**
places to actually work end-to-end — missing any one of them means the
protocol exists as code but isn't deployable through the platform.

## 1. Write the protocol core — `protocols/<name>-protocol.js`

Follow the existing style exactly (see `protocols/finance-signal-protocol.js`
or `protocols/workflow-engine-protocol.js` as templates):

- `'use strict';` at the top, zero external dependencies (stdlib/vanilla
  JS only — this is a hard constraint across all 16 existing protocols).
- Define `PHI = 1.618033988749895` and `PHI_INV = 0.618033988749895` as
  local constants (every protocol embeds these itself rather than
  importing them).
- Export a class (e.g. `class MyProtocol { ... }`) with a constructor, a
  primary method doing the actual work, a `pulse()` or `tick()` method if
  it has ongoing state, and a `snapshot()` method returning JSON-safe
  state.
- Use phi-decay for any adaptive scoring: success multiplies a score by
  `PHI`, failure by `PHI_INV` — this is the pattern used throughout
  (fleet scheduling, model evaluation, workflow engines all do this).
- `module.exports = { MyProtocolClass, ANY_ENUMS, PHI, PHI_INV };`

Assign a protocol ID following the existing naming convention:
`PROTO-<CATEGORY>-<NNN>` — categories in use so far: `FED` (federation),
`WORK` (orchestration/workflow), `GEN` (generation/synthesis), `FIN`
(finance), `INFRA` (infrastructure), `AI` (evaluation/orchestration),
`ARCH` (architecture). Reuse a category if it fits, or introduce a new
one if the vertical genuinely doesn't fit existing categories — check
`PROTOCOLS_MANIFEST.md` for the full current list before picking an ID
so you don't collide.

## 2. Register it in the Python backend — `aether_platform/protocols/registry.py`

Add a new `self.register(ProtocolSpec(...))` call inside
`ProtocolRegistry._boot()`. Required fields:

```python
ProtocolSpec(
    protocol_id='PROTO-XXX-NNN',
    name='Human Readable Name',
    handler_module='protocols.xxx_protocol',   # matches the .js filename, underscored
    handler_fn='ClassName.primaryMethod',
    ring_affinity=['COGNITIVE'],  # which sovereignty rings can deploy it — see RING enum
    memory_mb=256,
    cpu_millicores=500,
    isolation=IsolationLevel.PROCESS,  # or CONTAINER for anything finance/execution-related
    metadata={'type': 'category', ...},
)
```

Verify it actually loads — this has broken silently before (a bad
`target_class` default and non-serializable return types both shipped
undetected until someone actually ran the server):

```bash
python3 -m aether_platform.api.server &
sleep 1
curl -s http://localhost:7700/api/protocols | grep -c protocol_id   # should increment by 1
curl -s -X POST http://localhost:7700/api/protocols/PROTO-XXX-NNN/deploy -d '{}'
```

## 3. Register it in the JS console core — `apps/aether-console/functions/api/core.js`

Add a matching entry to the `PROTOCOL_REGISTRY` array (same file is
shared by the Cloudflare Pages Function and the Electron desktop app —
edit it once, both transports pick it up):

```js
{ protocol_id: 'PROTO-XXX-NNN', name: 'Human Readable Name', ring_affinity: ['COGNITIVE'], memory_mb: 256, cpu_millicores: 500, isolation: 'PROCESS', type: 'category' },
```

Verify with the same node-based smoke test used elsewhere in this repo:

```bash
cd apps/aether-console
node -e "
global.Response = class Response { constructor(b,i){this.body=b;this.status=(i&&i.status)||200;} async text(){return this.body;} };
global.Request = class Request {}; global.URL = URL;
import('./functions/api/[[path]].js').then(async (mod) => {
  const kv = { get: async()=>null, put: async()=>{} };
  const req = (m,p,b) => ({ method:m, url:'https://x.pages.dev'+p, text: async()=> b?JSON.stringify(b):'' });
  const res = await mod.onRequest({ request: req('GET','/api/protocols'), env:{AETHER_KV:kv} });
  console.log(JSON.parse(await res.text()).length, 'protocols registered');
});
"
```

## 4. Update the manifest — `PROTOCOLS_MANIFEST.md`

Add a section for the new protocol matching the existing format (ID,
agent, function, methods, key feature, handler file). Update the total
protocol count anywhere it's stated (this has drifted before — always
`grep -c "protocol_id="` against the actual registry file rather than
trusting a remembered count).

## Do not skip step 2 or 3

A protocol that only exists as a `.js` file in `protocols/` is not
deployable — `GET /api/protocols` won't list it and
`POST /api/protocols/:id/deploy` will 404. All three registrations are
required for the protocol to actually work through the platform, not
just exist as inert code.
