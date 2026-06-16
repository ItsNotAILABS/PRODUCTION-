# Medina Vault — macOS app

Menu-bar app that runs the vault dashboard locally and wires the MCP
server into Claude Desktop / Cursor / Cline / Zed in one click.

## What the user does

1. Open the `.dmg`, drag **Medina Vault** to Applications.
2. Launch it. A 𓂀 icon appears in the menu bar.
3. Click the icon →
   - **Open dashboard** — opens `http://localhost:8731` in the default browser.
   - **Wire MCP clients** — writes the MCP server snippet into each
     supported AI tool's config (with `.medina-bak` backup) and tells
     the user to restart those apps.
   - **Reveal vault file** — shows `~/.medina/vault.json` in Finder.
   - **About** — shows the protocol version and license.
   - **Quit** — stops the dashboard and exits.

No CLI. No Node install required on the user's machine — the app bundles
its own Electron runtime.

## How the developer builds the `.dmg`

Building macOS apps requires building **on a Mac** (electron-builder
needs the macOS SDK and code-signing tools).

From a Mac:

```bash
cd products/medina-vault-mac
npm install                            # installs electron + electron-builder devDeps
npm run dist:mac                       # builds x64 + arm64 .dmg
# output: products/medina-vault-mac/dist/Medina Vault-0.1.0.dmg
```

For unsigned local distribution (development), the above is enough.
For shipping to other Macs, you'll need:

- An Apple Developer ID (annual fee)
- `electron-builder` notarization config (`afterSign` hook)
- App-specific password in keychain for notarization

The shape of the unsigned `.dmg` is already correct — drag-to-Applications
DMG with the app bundled.

## How it differs from the Windows install

- Windows users: double-click `install.cmd` at the repo root.
- macOS users: install the `.dmg` once. The app lives in the menu bar.
- Both produce the same end state: a vault file at `~/.medina/vault.json`
  and MCP config snippets in each AI tool.

## What's bundled

The app's `app.asar` contains:

- `products/medina-vault/` — the MCP server source
- `products/medina-vault/charter/` — the Alpha Charter
- `products/medina-dashboard/` — the dashboard HTTP server
- `protocols/` — the 10 protocol documents

The user's vault lives outside the app at `~/.medina/vault.json` — the
app reads/writes that file. Updating the app doesn't touch the vault.
