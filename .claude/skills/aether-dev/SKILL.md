---
name: aether-dev
description: Use this skill when working on, testing, or debugging the Aether Sovereign Platform locally — running the console, desktop app, or Python backend during development, or verifying a change to any of them actually works before committing. Triggers on requests like "test the console locally", "run the backend", "check if my change broke anything", or "verify Aether still works".
---

# Local Development & Verification for Aether

This platform has three route implementations that must never drift
apart: `apps/aether-console/functions/api/core.js` (shared by the
Cloudflare console and the Electron desktop app) and
`aether_platform/api/router.py` (shared by the Python self-hosted server
and the Python Workers transport). **Any change to routing/business logic
must be verified against whichever of these two files it touches, and
ideally both if the change is conceptual (e.g. a new coherence rule)
rather than transport-specific.**

## Running each piece locally

**Python backend:**
```bash
python3 -m aether_platform.api.server
# → http://0.0.0.0:7700
curl -s http://localhost:7700/api/health
```

**JS console core (no Cloudflare account needed for logic testing):**
```bash
cd apps/aether-console
node -e "
global.Response = class Response { constructor(b,i){this.body=b;this.status=(i&&i.status)||200;} async text(){return this.body;} };
global.Request = class Request {}; global.URL = URL;
import('./functions/api/[[path]].js').then(async (mod) => {
  const kvStore = {};
  const kv = { get: async(k)=> kvStore[k]?JSON.parse(kvStore[k]):null, put: async(k,v)=>{kvStore[k]=v;} };
  const req = (m,p,b) => ({ method:m, url:'https://x.pages.dev'+p, text: async()=> b?JSON.stringify(b):'' });
  let res = await mod.onRequest({ request: req('GET','/api/health'), env:{AETHER_KV:kv} });
  console.log(await res.text());
});
"
```

**Electron desktop app — server logic only (works without a display):**
```bash
cd apps/aether-desktop
node -e "
const { createServer } = require('./server.js');
const server = createServer('/tmp/aether-test-state.json', 7873);
setTimeout(() => { server.close(); process.exit(0); }, 3000);
" &
sleep 1
curl -s http://127.0.0.1:7873/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7873/   # static index.html
```
The Electron GUI window itself (`npm start`) needs a display server —
this sandbox doesn't have one. Verify the server logic this way instead,
and tell the user plainly that the window itself wasn't visually checked.

## Regression checklist after any change to routing logic

Run these against whichever server you're testing (Python on :7700, the
console's core.js via the node snippet above, or the desktop server on
:7873) — this exact sequence has caught real bugs before (a bad
`target_class` default, non-serializable return types, an undefined enum
member):

1. `GET /api/health` → `status: "sovereign"`
2. `GET /api/fleet` → 3 seeded targets, `coherence: 1`
3. `GET /api/protocols` → count matches `grep -c protocol_id` on the
   registry file you're testing against
4. `POST /api/protocols/PROTO-FED-001/deploy` with `{}` (no
   `target_class`) → 201, does NOT crash on a bad default
5. `POST /api/protocols/PROTO-FED-001/deploy` with
   `{"target_class":"nonsense"}` → clean 400, not an unhandled exception
6. `POST /api/protocols/NOPE/deploy` → 404
7. `GET /api/workloads` after step 4 → the deployed workload is present
8. `POST /api/policy/evaluate` with `{"principal_id":"admin-001","action":"DEPLOY"}` → `allowed: true`

If you changed `core.js` or `router.py`, re-run this checklist against
**every transport that imports it** — that's the whole point of the
shared-core refactor; a bug fixed in one transport but not surfaced in
another means the fix didn't actually land where it needed to.

## Before pushing

`git fetch origin <branch>` and diff against `origin/<branch>` before
pushing — this repo has hit a real situation where local session state
reset but the remote already had newer commits than expected, causing a
duplicate-work push conflict. Reconcile with a rebase (favor whichever
side is the superset, verify with the regression checklist above, not
just a clean merge) rather than force-pushing over unknown remote state.
