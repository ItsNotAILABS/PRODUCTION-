/**
 * PROTO-B006: Cross-Platform Sync Protocol (CPSP)
 * Derives from: SovereignRoutingProtocol, CrossSubstrateResonanceProtocol
 * Orchestrates data synchronization across multiple commerce platforms
 * using conflict-resolution and phi-weighted priority queues.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const SYNC_STATUS = Object.freeze({
  PENDING:   'pending',
  IN_FLIGHT: 'in-flight',
  SYNCED:    'synced',
  CONFLICT:  'conflict',
  FAILED:    'failed',
});

export const CONFLICT_STRATEGY = Object.freeze({
  NEWEST_WINS:  'newest-wins',
  PLATFORM_PRIORITY: 'platform-priority',
  MANUAL:       'manual',
});

export class CrossPlatformSyncProtocol {
  constructor(config = {}) {
    this.version            = '1.0.0';
    this.domain             = 'business';
    this.conflictStrategy   = config.conflictStrategy ?? CONFLICT_STRATEGY.NEWEST_WINS;
    this.platformPriority   = config.platformPriority ?? [];  // ordered list
    this.metrics            = { synced: 0, conflicts: 0, resolved: 0, failed: 0 };
    this.#queue             = [];
    this.#journal           = [];   // append-only sync log
  }

  #queue;
  #journal;

  /**
   * Queue a sync job between platforms.
   * @param {{ entity: string, entityId: string, sourcePlatform: string, targetPlatforms: string[], data: object }} job
   * @returns {string} jobId
   */
  enqueue(job) {
    const jobId = `sync-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const priority = this.#platformPriority(job.sourcePlatform);
    this.#queue.push({ ...job, jobId, status: SYNC_STATUS.PENDING, priority, enqueuedAt: new Date().toISOString() });
    this.#queue.sort((a, b) => b.priority - a.priority);  // highest priority first
    return jobId;
  }

  /**
   * Process the sync queue and return results.
   * Each job is reconciled via conflict resolution then applied.
   * @param {Map<string, object>} platformData - current data per platform
   * @returns {{ processed: number, conflicts: object[], journal: object[] }}
   */
  process(platformData = new Map()) {
    const conflicts = [];

    for (const job of this.#queue) {
      if (job.status !== SYNC_STATUS.PENDING) continue;
      job.status = SYNC_STATUS.IN_FLIGHT;

      for (const target of job.targetPlatforms) {
        const existing = platformData.get(`${target}:${job.entity}:${job.entityId}`);
        const conflict = this.#detectConflict(job.data, existing);

        if (conflict) {
          const resolution = this.#resolveConflict(job, existing, target);
          conflicts.push({ jobId: job.jobId, target, resolution });
          this.metrics.conflicts++;
          if (resolution.resolved) this.metrics.resolved++;
        } else {
          platformData.set(`${target}:${job.entity}:${job.entityId}`, job.data);
        }
      }

      job.status = SYNC_STATUS.SYNCED;
      job.syncedAt = new Date().toISOString();
      this.metrics.synced++;
      this.#journal.push({ ...job, processedAt: new Date().toISOString() });
    }

    this.#queue = this.#queue.filter((j) => j.status !== SYNC_STATUS.SYNCED);
    return { processed: this.metrics.synced, conflicts, journal: [...this.#journal].slice(-50) };
  }

  /**
   * Get pending queue length and estimated processing order.
   */
  queueStatus() {
    return {
      pending:   this.#queue.filter((j) => j.status === SYNC_STATUS.PENDING).length,
      inFlight:  this.#queue.filter((j) => j.status === SYNC_STATUS.IN_FLIGHT).length,
      conflicts: this.metrics.conflicts,
    };
  }

  #detectConflict(incoming, existing) {
    if (!existing) return false;
    return JSON.stringify(incoming) !== JSON.stringify(existing);
  }

  #resolveConflict(job, existing, target) {
    if (this.conflictStrategy === CONFLICT_STRATEGY.NEWEST_WINS) {
      const incomingTs = job.data?.updatedAt ? new Date(job.data.updatedAt).getTime() : Date.now();
      const existingTs = existing?.updatedAt  ? new Date(existing.updatedAt).getTime() : 0;
      return { resolved: true, winner: incomingTs >= existingTs ? 'incoming' : 'existing' };
    }
    if (this.conflictStrategy === CONFLICT_STRATEGY.PLATFORM_PRIORITY) {
      const sourceRank = this.platformPriority.indexOf(job.sourcePlatform);
      const targetRank = this.platformPriority.indexOf(target);
      return { resolved: true, winner: sourceRank <= targetRank ? 'incoming' : 'existing' };
    }
    return { resolved: false, winner: 'manual-required' };
  }

  #platformPriority(platform) {
    const rank = this.platformPriority.indexOf(platform);
    return rank === -1 ? 0 : (this.platformPriority.length - rank) * PHI;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default CrossPlatformSyncProtocol;
