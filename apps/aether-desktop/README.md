# Aether Sovereign Desktop

A real, installable desktop app for the Aether Sovereign Console. No
Cloudflare account, no VPS, no deployment step — double-click and it runs
locally on your machine.

## How it works

- `server.js` starts a plain Node `http` server on `127.0.0.1:7873`,
  serving the console's existing UI (`../aether-console/index.html`,
  unmodified) and its `/api/*` routes.
- The route logic is `require`d directly from
  `../aether-console/functions/api/core.js` — the same module the
  Cloudflare Pages Functions transport uses. Nothing is duplicated; this
  desktop app, the Cloudflare console, and the Python backend
  (`aether_platform/`) all dispatch through one of two identical route
  implementations (JS `core.js` / Python `router.py`), so behavior can't
  drift between them.
- State (fleet, workloads, policy audit log) persists to a JSON file in
  the OS-standard user-data directory (`app.getPath('userData')`) instead
  of Cloudflare KV — verified by actually deploying a protocol, killing
  the server, and confirming the workload was still there on the next
  launch.
- `main.js` is the thin Electron shell: starts the server, opens a
  `BrowserWindow` pointed at `http://127.0.0.1:7873/`.

## Run it (development)

```bash
cd apps/aether-desktop
npm install
npm start
```

## Verification status

The local server (`server.js`) — the substantive part: static file
serving, all 15 API routes, and disk persistence — was run and
curl-tested directly with plain Node, including a full process restart to
confirm a deployed protocol workload survived. The Electron GUI shell
(`main.js`, `BrowserWindow`) has **not** been visually verified in this
environment (no display server available here) — run `npm start` on your
own machine to confirm the window opens correctly; the underlying logic
it depends on is already proven to work.

## Build an installer

```bash
npm run dist        # current platform
npm run dist:win     # NSIS installer + portable .exe
npm run dist:mac     # .dmg
npm run dist:linux   # AppImage
```

Output goes to `dist/desktop-aether/`. Requires `electron-builder`
(already in `devDependencies`) — the actual packaging step was not run in
this environment either; the same "logic proven, GUI/packaging unverified
here" caveat applies.

## Why this instead of the Cloudflare console for local use

The Cloudflare console (`apps/aether-console/`) needs a Pages deployment
and a KV namespace to persist state. This desktop app needs neither — it
runs entirely offline, on your machine, with the same UI and the same API
surface, differing only in where state is stored (a local file instead of
Cloudflare KV) and how the server is invoked (Electron's Node runtime
instead of the Workers runtime).
