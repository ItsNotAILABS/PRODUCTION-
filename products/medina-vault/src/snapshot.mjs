// snapshot.mjs — atomic JSON persistence for the vault.
// Default location: ~/.medina/vault.json
// Atomic write: write to vault.json.tmp, fsync, rename.

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function defaultVaultPath() {
  return process.env.MEDINA_VAULT_PATH
      ?? join(homedir(), '.medina', 'vault.json');
}

export async function loadSnapshot(path = defaultVaultPath()) {
  try {
    const raw = await fs.readFile(path, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveSnapshot(snapshot, path = defaultVaultPath()) {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
  await fs.rename(tmp, path);
}
