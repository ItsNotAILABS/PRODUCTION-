import crypto from 'node:crypto';

/**
 * XMicrobotOrchestrator — fleet manager for X ecosystem microbots.
 * Supports per-tenant and per-platform scoping, task dispatch with exponential-backoff
 * retry, result aggregation, and fleet health reporting.
 */
export class XMicrobotOrchestrator {
  #bots      = new Map(); // botId → entry
  #byTenant  = new Map(); // tenantId → botId[]
  #taskLog   = [];
  #maxBotsTotal;
  #maxBotsPerTenant;

  /**
   * @param {{ maxBotsTotal?: number, maxBotsPerTenant?: number }} opts
   */
  constructor({ maxBotsTotal = 500, maxBotsPerTenant = 50 } = {}) {
    this.#maxBotsTotal     = maxBotsTotal;
    this.#maxBotsPerTenant = maxBotsPerTenant;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Register a microbot into the fleet.
   * @param {object} bot - Must implement run(task): Promise<object>. May implement stop().
   * @param {{
   *   tenantId?:  string,
   *   platform?:  string,
   *   missionId?: string,
   *   tags?:      string[],
   *   meta?:      object,
   * }} [opts]
   * @returns {string} botId
   */
  spawn(bot, { tenantId = 'default', platform = null, missionId = null, tags = [], meta = {} } = {}) {
    if (typeof bot.run !== 'function') {
      throw new TypeError('Microbot must implement run(task): Promise<object>');
    }
    if (this.#bots.size >= this.#maxBotsTotal) {
      throw new Error(`XMicrobotOrchestrator: max total bots reached (${this.#maxBotsTotal})`);
    }
    const tenantBotIds = this.#byTenant.get(tenantId) ?? [];
    if (tenantBotIds.length >= this.#maxBotsPerTenant) {
      throw new Error(
        `XMicrobotOrchestrator: max bots per tenant "${tenantId}" reached (${this.#maxBotsPerTenant})`,
      );
    }

    const botId = crypto.randomUUID();
    const entry = {
      botId, bot, tenantId, platform, missionId, tags, meta,
      status:         'idle',
      spawnedAt:      new Date().toISOString(),
      completedTasks: 0,
      failedTasks:    0,
    };

    this.#bots.set(botId, entry);
    this.#byTenant.set(tenantId, [...tenantBotIds, botId]);
    return botId;
  }

  /** Stop and remove a microbot from the fleet. */
  despawn(botId) {
    const entry = this.#bots.get(botId);
    if (!entry) return;
    entry.bot.stop?.();
    this.#bots.delete(botId);
    const ids = this.#byTenant.get(entry.tenantId) ?? [];
    this.#byTenant.set(entry.tenantId, ids.filter((id) => id !== botId));
  }

  // ---------------------------------------------------------------------------
  // Task dispatch
  // ---------------------------------------------------------------------------

  /**
   * Dispatch a task to a specific bot with automatic retry on failure.
   * @param {string} botId
   * @param {object} task
   * @param {{ maxRetries?: number, backoffMs?: number }} [opts]
   * @returns {Promise<object>}
   */
  async dispatch(botId, task, { maxRetries = 3, backoffMs = 500 } = {}) {
    const entry = this.#bots.get(botId);
    if (!entry) throw new Error(`XMicrobotOrchestrator: bot "${botId}" not found`);

    entry.status = 'running';
    let lastErr;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await entry.bot.run(task);
        entry.status = 'idle';
        entry.completedTasks++;
        this.#taskLog.push({ botId, task, result, attempt, success: true, ts: new Date().toISOString() });
        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) await this.#sleep(backoffMs * 2 ** attempt);
      }
    }

    entry.status = 'idle';
    entry.failedTasks++;
    this.#taskLog.push({ botId, task, error: lastErr.message, attempt: maxRetries, success: false, ts: new Date().toISOString() });
    throw lastErr;
  }

  /**
   * Broadcast the same task to every bot scoped to a tenant.
   * @param {string} tenantId
   * @param {object} task
   * @param {object} [opts]
   * @returns {Promise<Array<{ botId: string, success: boolean, result?: object, error?: string }>>}
   */
  async broadcast(tenantId, task, opts = {}) {
    const ids = this.#byTenant.get(tenantId) ?? [];
    const settled = await Promise.allSettled(ids.map((id) => this.dispatch(id, task, opts)));
    return settled.map((r, i) => ({
      botId:   ids[i],
      success: r.status === 'fulfilled',
      result:  r.status === 'fulfilled' ? r.value : undefined,
      error:   r.status === 'rejected'  ? r.reason?.message : undefined,
    }));
  }

  // ---------------------------------------------------------------------------
  // Observability
  // ---------------------------------------------------------------------------

  /**
   * List bots, optionally scoped to a tenant.
   * @param {string} [tenantId]
   * @returns {object[]} Bot entries without the bot instance
   */
  list(tenantId) {
    const entries = tenantId
      ? (this.#byTenant.get(tenantId) ?? []).map((id) => this.#bots.get(id)).filter(Boolean)
      : [...this.#bots.values()];
    return entries.map(({ bot: _, ...rest }) => rest);
  }

  /** @returns {{ total: number, idle: number, running: number, tenants: number, taskLog: number }} */
  status() {
    const all = [...this.#bots.values()];
    return {
      total:   all.length,
      idle:    all.filter((b) => b.status === 'idle').length,
      running: all.filter((b) => b.status === 'running').length,
      tenants: this.#byTenant.size,
      taskLog: this.#taskLog.length,
    };
  }

  #sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
}

export default XMicrobotOrchestrator;
