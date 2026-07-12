/**
 * PROTO-I032: Sovereign Mission Engine (formerly Background Workflow Protocol)
 * Derives from: AetherAgent heartbeat pattern, IntegrationOrchestrationProtocol
 *
 * Formalizes long-running, zero-token background execution: missions tick on a
 * local heartbeat (no LLM call per tick), run on day-of-week schedules, chain
 * into "stack flows", and can spawn their own children at runtime — a process
 * tree, not a single loop. This is the substrate for recurring business
 * operations and persistent "servers" that run Monday through Sunday without
 * consuming any model tokens.
 *
 * A "mission" is a workflow loaded with up to 4 skills (functions) that run in
 * sequence on each fire. `deploy()` is the one-call path: register + run now +
 * return full status, for "one button, one command" activation. A running
 * mission can read commands pushed in from outside via `command()` — the
 * "command center" interface — without needing a new model call to receive them.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;
const MS_PER_DAY = 86_400_000;
const MAX_SKILLS_PER_MISSION = 4;
const MAX_QUEUED_COMMANDS = 200;

export const WORKFLOW_RECURRENCE = Object.freeze({
  ONCE:       'once',
  DAILY:      'daily',
  WEEKLY:     'weekly',
  CONTINUOUS: 'continuous', // every tick, no schedule gate
});

export const MISSION_ENGINE_DESIGNATION = 'Sovereign Mission Engine';

export class BackgroundWorkflowProtocol {
  #workflows = new Map(); // id -> { skills[], recurrence, daysOfWeek, nextRunAt, runs[], status, parentId, commands[] }
  #chains    = new Map(); // chainId -> [workflowId, ...]
  #children  = new Map(); // parentId -> Set(childId)
  #startedAt = Date.now();

  constructor(config = {}) {
    this.version     = '1.2.0';
    this.domain      = 'integrations';
    this.designation = MISSION_ENGINE_DESIGNATION;
    this.metrics     = { ticks: 0, runs: 0, failures: 0, spawned: 0, tokensConsumed: 0, totalRuntimeMs: 0 };
  }

  /**
   * Register a workflow. `handler` is plain local code — never an LLM call —
   * so each run costs runtime, not tokens.
   */
  registerWorkflow(id, { handler, recurrence = WORKFLOW_RECURRENCE.CONTINUOUS, daysOfWeek = [], intervalMs = null, parentId = null } = {}, opts) {
    if (typeof handler !== 'function') throw new Error('registerWorkflow requires a handler function');
    return this.#register(id, { skills: [handler], recurrence, daysOfWeek, intervalMs, parentId }, opts);
  }

  /**
   * Register a mission — a workflow loaded with up to 4 skills that run in
   * sequence on each fire. This is the standard unit of the Mission Engine.
   */
  registerMission(id, { skills = [], recurrence = WORKFLOW_RECURRENCE.CONTINUOUS, daysOfWeek = [], intervalMs = null, parentId = null } = {}, opts) {
    if (!Array.isArray(skills) || skills.length === 0) throw new Error('registerMission requires at least 1 skill');
    if (skills.length > MAX_SKILLS_PER_MISSION) throw new Error(`registerMission supports at most ${MAX_SKILLS_PER_MISSION} skills per mission`);
    return this.#register(id, { skills, recurrence, daysOfWeek, intervalMs, parentId }, opts);
  }

  /**
   * Explicitly replace an already-registered mission's skills/schedule —
   * the only path that's allowed to overwrite an existing id. Run history,
   * command queue, and parent linkage carry forward instead of resetting,
   * so a redeploy never silently erases a mission's track record.
   */
  redeploy(id, spec) {
    if (!this.#workflows.has(id)) throw new Error(`Cannot redeploy unknown mission "${id}" — use deploy() to create it first.`);
    return registrationIsMission(spec)
      ? this.registerMission(id, spec, { replace: true })
      : this.registerWorkflow(id, spec, { replace: true });
  }

  #register(id, { skills, recurrence, daysOfWeek, intervalMs, parentId }, { replace = false } = {}) {
    const existing = this.#workflows.get(id);
    if (existing && !replace) {
      throw new Error(`Mission "${id}" already exists — use redeploy() to replace it (run history is preserved), or choose a different id. Registration never silently overwrites.`);
    }
    this.#workflows.set(id, {
      skills,
      recurrence,
      daysOfWeek,         // 0=Sun..6=Sat, used when recurrence === WEEKLY
      intervalMs,          // used when recurrence === DAILY/CONTINUOUS as min gap
      nextRunAt: Date.now(),
      runs: existing?.runs || [],
      status: 'idle',
      parentId: parentId ?? existing?.parentId ?? null,
      commands: existing?.commands || [],
    });
    if (parentId) {
      if (!this.#children.has(parentId)) this.#children.set(parentId, new Set());
      this.#children.get(parentId).add(id);
    }
    return { id, recurrence, skillCount: skills.length, parentId, registeredAt: new Date().toISOString() };
  }

  /**
   * One-shot deploy: register a mission and fire it immediately, returning
   * full status in one call — "one button, one query, one command."
   */
  async deploy(id, spec) {
    const registration = registrationIsMission(spec) ? this.registerMission(id, spec) : this.registerWorkflow(id, spec);
    const wf = this.#workflows.get(id);
    const result = await this.#runWorkflow(id, wf, Date.now());
    return { registration, result, health: this.health(id) };
  }

  /**
   * Spawn a child mission at runtime from inside a running mission's skill —
   * the engine builds its own process tree instead of staying a flat loop.
   */
  spawn(parentId, childId, spec) {
    if (!this.#workflows.has(parentId)) throw new Error(`Cannot spawn from unknown mission "${parentId}"`);
    if (childId === parentId) throw new Error('A mission cannot spawn itself as its own child');
    if (this.#isAncestor(childId, parentId)) {
      throw new Error(`Cannot spawn "${childId}" as a child of "${parentId}" — it is already an ancestor of it (would create a cycle)`);
    }
    this.metrics.spawned++;
    return registrationIsMission(spec)
      ? this.registerMission(childId, { ...spec, parentId })
      : this.registerWorkflow(childId, { ...spec, parentId });
  }

  #isAncestor(candidateId, startId) {
    let current = this.#workflows.get(startId)?.parentId;
    while (current) {
      if (current === candidateId) return true;
      current = this.#workflows.get(current)?.parentId;
    }
    return false;
  }

  /** Full parent/child process tree — for visualization (dashboards, status views). */
  tree(rootId = null) {
    const roots = rootId ? [rootId] : [...this.#workflows.keys()].filter(id => !this.#workflows.get(id).parentId);
    const build = (id, seen) => {
      if (seen.has(id)) return { id, error: 'cycle-detected', children: [] };
      seen.add(id);
      return {
        id,
        ...this.health(id),
        children: [...(this.#children.get(id) || [])].map(childId => build(childId, seen)),
      };
    };
    return roots.map(id => build(id, new Set()));
  }

  /**
   * Push a command into a running mission's queue — the "command center"
   * interface. A mission's skills can call `drainCommands(id)` to read and
   * clear it on their next run, without any model call being involved.
   */
  command(id, payload) {
    const wf = this.#workflows.get(id);
    if (!wf) throw new Error(`Unknown mission "${id}"`);
    wf.commands.push({ payload, at: new Date().toISOString() });
    if (wf.commands.length > MAX_QUEUED_COMMANDS) wf.commands.shift();
    return { id, queued: wf.commands.length };
  }

  drainCommands(id) {
    const wf = this.#workflows.get(id);
    if (!wf) throw new Error(`Unknown mission "${id}"`);
    const drained = wf.commands;
    wf.commands = [];
    return drained;
  }

  /** Chain workflows into a stack flow — runs in sequence when chain ticks land. */
  chain(chainId, workflowIds) {
    for (const id of workflowIds) {
      if (!this.#workflows.has(id)) throw new Error(`Cannot chain unknown workflow "${id}"`);
    }
    this.#chains.set(chainId, workflowIds);
    return { chainId, length: workflowIds.length };
  }

  /**
   * Stop and remove a mission from active scheduling. Returns its final
   * health snapshot so the caller can archive it — unregister never deletes
   * anything silently, it hands the last-known state back to you.
   */
  unregister(id) {
    const wf = this.#workflows.get(id);
    if (!wf) throw new Error(`Unknown mission "${id}"`);
    const snapshot = { id, ...this.health(id) };
    this.#workflows.delete(id);
    this.#children.delete(id);
    for (const childSet of this.#children.values()) childSet.delete(id);
    for (const [chainId, ids] of this.#chains) {
      if (ids.includes(id)) this.#chains.set(chainId, ids.filter(x => x !== id));
    }
    return snapshot;
  }

  /** Advance the heartbeat. Call this on your own interval (e.g. 873ms AetherAgent tick). */
  async tick(now = Date.now()) {
    this.metrics.ticks++;
    const fired = [];
    for (const [id, wf] of this.#workflows) {
      if (!this.#isDue(wf, now)) continue;
      fired.push(await this.#runWorkflow(id, wf, now));
    }
    return { tickedAt: new Date(now).toISOString(), fired };
  }

  /** Run a chain explicitly (stack flow), in sequence, stopping on first failure. */
  async runChain(chainId) {
    const ids = this.#chains.get(chainId);
    if (!ids) throw new Error(`Unknown chain "${chainId}"`);
    const results = [];
    for (const id of ids) {
      const wf = this.#workflows.get(id);
      const result = await this.#runWorkflow(id, wf, Date.now());
      results.push(result);
      if (!result.ok) break;
    }
    return { chainId, results, allOk: results.every(r => r.ok) };
  }

  #isDue(wf, now) {
    // A mission already mid-run (slow network/disk/canister I/O in a skill)
    // never gets entered a second time by an overlapping tick.
    if (wf.status === 'running') return false;
    if (now < wf.nextRunAt) return false;
    if (wf.recurrence === WORKFLOW_RECURRENCE.WEEKLY) {
      const day = new Date(now).getDay();
      return wf.daysOfWeek.includes(day);
    }
    return true;
  }

  async #runWorkflow(id, wf, now) {
    wf.status = 'running';
    const start = Date.now();
    let ok = true, error = null, outputs = [];
    // Drained once per run, not once per skill — only the first skill in the
    // chain receives the queue, matching the documented command-center contract.
    const commands = this.drainCommands(id);
    for (let i = 0; i < wf.skills.length; i++) {
      try {
        outputs.push(await wf.skills[i](i === 0 ? commands : []));
      } catch (e) {
        ok = false; error = e.message;
        this.metrics.failures++;
        break;
      }
    }
    const runtimeMs = Date.now() - start;
    this.metrics.runs++;
    this.metrics.totalRuntimeMs += runtimeMs;
    // tokensConsumed stays 0 by construction — skills are local code, not model calls.

    wf.runs.push({ at: new Date(start).toISOString(), runtimeMs, ok, error });
    if (wf.runs.length > 100) wf.runs.shift();
    wf.status = ok ? 'idle' : 'failed';
    wf.nextRunAt = this.#nextRunAt(wf, now);

    const output = outputs.length > 1 ? outputs : outputs[0];
    return { id, ok, error, output, runtimeMs };
  }

  #nextRunAt(wf, now) {
    switch (wf.recurrence) {
      case WORKFLOW_RECURRENCE.ONCE:       return Infinity;
      case WORKFLOW_RECURRENCE.DAILY:      return now + (wf.intervalMs || MS_PER_DAY);
      case WORKFLOW_RECURRENCE.WEEKLY:     return now + MS_PER_DAY; // re-check next day for next matching weekday
      case WORKFLOW_RECURRENCE.CONTINUOUS: return now + (wf.intervalMs || 0);
      default:                              return now;
    }
  }

  /** Phi-weighted health score: recent runs weighted more, failures penalized. */
  health(id) {
    const wf = this.#workflows.get(id);
    if (!wf) throw new Error(`Unknown workflow "${id}"`);
    if (wf.runs.length === 0) {
      return { status: wf.status, score: 1, runs: 0, parentId: wf.parentId, skillCount: wf.skills.length, tokensConsumed: 0 };
    }

    let score = 0, weight = 0, w = 1;
    for (let i = wf.runs.length - 1; i >= 0; i--) {
      score  += (wf.runs[i].ok ? 1 : 0) * w;
      weight += w;
      w *= PHI_INV;
    }
    const uptimeMs = Date.now() - this.#startedAt;
    return {
      status: wf.status,
      score: parseFloat((score / weight).toFixed(4)),
      runs: wf.runs.length,
      lastRunAt: wf.runs[wf.runs.length - 1].at,
      uptimeMs,
      parentId: wf.parentId,
      skillCount: wf.skills.length,
      tokensConsumed: 0,
    };
  }

  statusAll() {
    return [...this.#workflows.keys()].map(id => ({ id, ...this.health(id) }));
  }

  report() {
    return {
      designation: this.designation,
      version: this.version,
      domain: this.domain,
      metrics: this.metrics,
      missions: this.#workflows.size,
      chains: this.#chains.size,
      uptimeMs: Date.now() - this.#startedAt,
      note: 'Background ticks execute local skills only — zero tokens per run by design.',
    };
  }

  /**
   * Serialize schedule, run history, command queues, and metrics — write this
   * to disk/KV on an interval so missions survive a process restart. Skills
   * are functions, not data, so they are NOT included here; `restore()`
   * re-attaches them from the live process via `skillsById`.
   */
  toJSON() {
    const workflows = [...this.#workflows.entries()].map(([id, wf]) => [id, {
      recurrence: wf.recurrence,
      daysOfWeek: wf.daysOfWeek,
      intervalMs: wf.intervalMs,
      nextRunAt: wf.nextRunAt,
      runs: wf.runs,
      status: wf.status,
      parentId: wf.parentId,
      commands: wf.commands,
      skillCount: wf.skills.length,
    }]);
    return {
      version: this.version,
      startedAt: this.#startedAt,
      metrics: this.metrics,
      workflows,
      chains: [...this.#chains.entries()],
      children: [...this.#children.entries()].map(([k, v]) => [k, [...v]]),
    };
  }

  /**
   * Restore engine state from a toJSON() snapshot. `skillsById` (id -> skills[])
   * must re-supply each mission's actual skill functions — the host process
   * owns that code, the snapshot only carries schedule and history around it.
   */
  restore(snapshot, skillsById = {}) {
    this.#startedAt = snapshot.startedAt ?? Date.now();
    this.metrics = { ...this.metrics, ...snapshot.metrics };
    for (const [id, wf] of snapshot.workflows) {
      const skills = skillsById[id];
      if (!Array.isArray(skills) || skills.length === 0) {
        throw new Error(`restore() requires skills for mission "${id}" via skillsById — skill code is not part of the snapshot`);
      }
      this.#workflows.set(id, { ...wf, skills });
    }
    for (const [chainId, ids] of snapshot.chains) this.#chains.set(chainId, ids);
    for (const [parentId, childIds] of snapshot.children) this.#children.set(parentId, new Set(childIds));
    return { restored: this.#workflows.size, chains: this.#chains.size };
  }
}

function registrationIsMission(spec) {
  return Array.isArray(spec?.skills);
}

export default BackgroundWorkflowProtocol;
