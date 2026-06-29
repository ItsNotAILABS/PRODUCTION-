/**
 * PROTO-I019: Customer Identity Protocol (CIP)
 * Derives from: CustomerSegmentationProtocol, CustomerRetentionProtocol
 * Unified customer profiles across platforms with identity linking, merging, and resolution.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class CustomerIdentityProtocol {
  #masterProfiles = new Map(); // masterCustomerId → { platforms: Map<platform, [platformCustomerId]>, data: Map }
  #index          = new Map(); // `${platform}:${platformCustomerId}` → masterCustomerId

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.metrics  = { linked: 0, merged: 0, resolved: 0 };
  }

  /** Link a platform customer ID to a master identity. Creates master if masterCustomerId is omitted. */
  link(platformId, platformCustomerId, masterCustomerId = null) {
    const key = `${platformId}:${platformCustomerId}`;
    if (!masterCustomerId) {
      // Check if already linked
      masterCustomerId = this.#index.get(key) ?? `master-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (!this.#masterProfiles.has(masterCustomerId)) {
      this.#masterProfiles.set(masterCustomerId, { platforms: new Map(), data: new Map() });
    }
    const master = this.#masterProfiles.get(masterCustomerId);
    if (!master.platforms.has(platformId)) master.platforms.set(platformId, []);
    if (!master.platforms.get(platformId).includes(platformCustomerId)) {
      master.platforms.get(platformId).push(platformCustomerId);
    }
    this.#index.set(key, masterCustomerId);
    this.metrics.linked++;
    return { masterCustomerId, platformId, platformCustomerId };
  }

  /** Merge two master identities. All platform links are unified under masterIdA. */
  merge(masterIdA, masterIdB) {
    const a = this.#masterProfiles.get(masterIdA);
    const b = this.#masterProfiles.get(masterIdB);
    if (!a) throw new Error(`Master not found: ${masterIdA}`);
    if (!b) throw new Error(`Master not found: ${masterIdB}`);

    // Merge platforms
    for (const [platform, ids] of b.platforms) {
      if (!a.platforms.has(platform)) a.platforms.set(platform, []);
      for (const id of ids) {
        if (!a.platforms.get(platform).includes(id)) a.platforms.get(platform).push(id);
        this.#index.set(`${platform}:${id}`, masterIdA);
      }
    }

    // Phi-weighted data merge: if key conflict, keep value with higher phi score (prefer A's data as primary)
    for (const [key, val] of b.data) {
      if (!a.data.has(key)) a.data.set(key, val);
      else {
        const aVal = a.data.get(key);
        const score = (typeof aVal === 'number' ? aVal : 0) * PHI - (typeof val === 'number' ? val : 0) * PHI_INV;
        if (score < 0) a.data.set(key, val);
      }
    }

    this.#masterProfiles.delete(masterIdB);
    this.metrics.merged++;
    return { survivingId: masterIdA, absorbedId: masterIdB, platformCount: a.platforms.size };
  }

  /** Resolve a platform customer ID to its master ID. */
  resolve(platformId, platformCustomerId) {
    const masterId = this.#index.get(`${platformId}:${platformCustomerId}`);
    if (!masterId) return { resolved: false, masterCustomerId: null };
    this.metrics.resolved++;
    return { resolved: true, masterCustomerId: masterId };
  }

  /** Return merged profile data for a master customer. */
  profile(masterCustomerId) {
    const master = this.#masterProfiles.get(masterCustomerId);
    if (!master) throw new Error(`Master not found: ${masterCustomerId}`);
    const platforms = {};
    for (const [p, ids] of master.platforms) platforms[p] = ids;
    const data = Object.fromEntries(master.data);
    const phiScore = parseFloat((master.platforms.size * PHI_INV).toFixed(4));
    return { masterCustomerId, platforms, data, platformCount: master.platforms.size, phiScore };
  }

  /** Store additional data on a master profile. */
  storeData(masterCustomerId, key, value) {
    const master = this.#masterProfiles.get(masterCustomerId);
    if (!master) throw new Error(`Master not found: ${masterCustomerId}`);
    master.data.set(key, value);
    return { stored: true };
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default CustomerIdentityProtocol;
