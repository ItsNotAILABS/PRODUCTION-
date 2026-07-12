/**
 * PROTO-I007: API Key Manager Protocol (AKMP)
 * Derives from: Chrono VaultProtocol, SecurityGatewayProtocol
 * Secure API key registry with rotation, audit history, and phi-weighted expiry scoring.
 */

import { createHash } from 'crypto';

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;
const MS_PER_DAY = 86_400_000;

export class APIKeyManagerProtocol {
  #keys    = new Map(); // `${platform}:${tenantId}` → { hash, key, rotateAfterMs, storedAt, history[] }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.metrics  = { stored: 0, retrieved: 0, rotated: 0, revoked: 0 };
  }

  /** Store an API key with optional rotation schedule. */
  store(platform, tenantId, key, { rotateAfterDays = 90 } = {}) {
    const k = `${platform}:${tenantId}`;
    const hash = createHash('sha256').update(key).digest('hex');
    this.#keys.set(k, {
      hash,
      key,
      rotateAfterMs: rotateAfterDays * MS_PER_DAY,
      storedAt: Date.now(),
      history: [],
    });
    this.metrics.stored++;
    return { platform, tenantId, hash, rotateAfterDays };
  }

  /** Retrieve an API key, with phi-weighted expiry score. */
  retrieve(platform, tenantId) {
    const entry = this.#getEntry(platform, tenantId);
    const ageMs = Date.now() - entry.storedAt;
    const expiryScore = Math.max(0, 1 - (ageMs / entry.rotateAfterMs) * PHI_INV);
    const daysLeft = Math.max(0, Math.floor((entry.rotateAfterMs - ageMs) / MS_PER_DAY));
    this.metrics.retrieved++;
    return { key: entry.key, expiryScore, daysLeft, needsRotation: daysLeft <= 7 };
  }

  /** Rotate to a new key, invalidating the old one. */
  rotate(platform, tenantId, newKey) {
    const k     = `${platform}:${tenantId}`;
    const entry = this.#getEntry(platform, tenantId);
    entry.history.push({ hash: entry.hash, rotatedAt: Date.now() });
    entry.key      = newKey;
    entry.hash     = createHash('sha256').update(newKey).digest('hex');
    entry.storedAt = Date.now();
    this.metrics.rotated++;
    return { platform, tenantId, newHash: entry.hash, rotatedAt: new Date().toISOString() };
  }

  /** Return usage history for a key. */
  audit(platform, tenantId) {
    const entry  = this.#getEntry(platform, tenantId);
    const ageMs  = Date.now() - entry.storedAt;
    const phiAge = ageMs / entry.rotateAfterMs;
    return {
      platform,
      tenantId,
      currentHash: entry.hash,
      storedAt:    new Date(entry.storedAt).toISOString(),
      rotations:   entry.history.length,
      history:     entry.history,
      phiAgeScore: parseFloat((phiAge * PHI_INV).toFixed(4)),
    };
  }

  /** Revoke a stored key. */
  revoke(platform, tenantId) {
    const deleted = this.#keys.delete(`${platform}:${tenantId}`);
    if (deleted) this.metrics.revoked++;
    return { revoked: deleted };
  }

  #getEntry(platform, tenantId) {
    const entry = this.#keys.get(`${platform}:${tenantId}`);
    if (!entry) throw new Error(`No key stored for ${platform}:${tenantId}`);
    return entry;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default APIKeyManagerProtocol;
