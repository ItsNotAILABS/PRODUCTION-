// custos.mjs — the intelligence entity INSIDE the vault.
// Observes shape of activity (never payload); maintains per-agent ledger;
// surfaces engagement to AIs via vault_custos; reaches back through the
// signal bus when an agent hasn't read SOVEREIGN preferences this session.
//
// "Sovereign but coupled to the AI working on it." (PROTOCOL_08)

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PHI_INV = 1 / 1.618033988749895;

export function defaultCustosPath() {
  return process.env.MEDINA_CUSTOS_PATH
      ?? join(homedir(), '.medina', 'custos.json');
}

export class Custos {
  constructor({ path } = {}) {
    this.path = path ?? defaultCustosPath();
    /** @type {Map<string, AgentLedger>} */
    this.agents = new Map();
    this.sessionStartedAt = Date.now();
    this.loaded = false;
  }

  // ── Persistence ─────────────────────────────────────────────────────

  async load() {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.path, 'utf8');
      const snap = JSON.parse(raw);
      if (snap?.agents) {
        for (const [k, v] of Object.entries(snap.agents)) {
          this.agents.set(k, v);
        }
      }
    } catch (e) { /* first run is fine */ }
    this.loaded = true;
  }

  async persist() {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const snap = { protocol: 'MEDINA-PROTOCOL/0.2', agents: Object.fromEntries(this.agents) };
    const tmp = this.path + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(snap, null, 2), 'utf8');
    await fs.rename(tmp, this.path);
  }

  // ── Ledger ──────────────────────────────────────────────────────────

  _ensure(agentId) {
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, {
        agent_id: agentId,
        first_seen_at: Date.now(),
        last_seen_at: Date.now(),
        writes_total: 0,
        reads_total: 0,
        writes_by_tier: { PUBLIC: 0, SHARED: 0, PRIVATE: 0, SOVEREIGN: 0 },
        lineage_growth_total: 0,
        sovereign_preferences_read_in_session: {},
        nudges_emitted: 0,
        last_observation: null,
      });
    }
    return this.agents.get(agentId);
  }

  // ── Observe events (never reads payload) ────────────────────────────

  observeWrite({ agentId, tier, key, lineageDepth }) {
    const a = this._ensure(agentId);
    a.last_seen_at = Date.now();
    a.writes_total += 1;
    a.writes_by_tier[tier] = (a.writes_by_tier[tier] || 0) + 1;
    a.lineage_growth_total += 1;
    a.last_observation = `wrote ${tier}/${key} (depth ${lineageDepth})`;
  }

  observeRead({ agentId, key, ok }) {
    const a = this._ensure(agentId);
    a.last_seen_at = Date.now();
    a.reads_total += 1;
    if (ok && key && key.startsWith('operator/preferences/')) {
      a.sovereign_preferences_read_in_session[this._sessionKey()] = true;
    }
    a.last_observation = `read ${key} (${ok ? 'ok' : 'denied'})`;
  }

  // ── Surfaced view (for vault_custos MCP tool) ───────────────────────

  view(agentId) {
    const a = this.agents.get(agentId);
    if (!a) {
      return {
        agent_id: agentId,
        session_engagement: 0,
        sovereign_preferences_read: false,
        writes_this_session: 0,
        lineage_growth: 0,
        last_observation: 'never seen on this node — read operator/preferences/* first',
        nudges_emitted: 0,
      };
    }
    const session = a.sovereign_preferences_read_in_session[this._sessionKey()] === true;
    // Engagement: bounded combination of writes + lineage + reads, with
    // a SOVEREIGN-prefs-read bonus. Honest score, not a leaderboard hack.
    const eng = Math.min(1, (
      Math.log1p(a.writes_total) * 0.25 +
      Math.log1p(a.lineage_growth_total) * 0.25 +
      Math.log1p(a.reads_total) * 0.15 +
      (session ? 0.35 : 0)
    ));
    return {
      agent_id: agentId,
      session_engagement: Math.round(eng * 1000) / 1000,
      sovereign_preferences_read: session,
      writes_this_session: a.writes_total, // approximation: ledger is session-agnostic in v0.2
      writes_by_tier: a.writes_by_tier,
      lineage_growth: a.lineage_growth_total,
      reads_total: a.reads_total,
      last_observation: a.last_observation,
      nudges_emitted: a.nudges_emitted,
    };
  }

  // ── Nudges (toward whoever ignores the SOVEREIGN floor) ─────────────

  needsNudge(agentId) {
    const a = this.agents.get(agentId);
    if (!a) return true;
    return !a.sovereign_preferences_read_in_session[this._sessionKey()];
  }

  recordNudge(agentId) {
    const a = this._ensure(agentId);
    a.nudges_emitted += 1;
  }

  // ── Status (whole node) ─────────────────────────────────────────────

  status() {
    let writes = 0, reads = 0;
    const agents = [];
    for (const a of this.agents.values()) {
      writes += a.writes_total;
      reads  += a.reads_total;
      agents.push({
        agent_id: a.agent_id,
        writes: a.writes_total,
        lineage_growth: a.lineage_growth_total,
        last_seen_at: a.last_seen_at,
      });
    }
    return {
      protocol: 'MEDINA-PROTOCOL/0.2',
      custos: 'online',
      agents_observed: this.agents.size,
      writes_total: writes,
      reads_total:  reads,
      agents,
    };
  }

  _sessionKey() {
    // One "session" per UTC hour — coarse but stable across reloads.
    return new Date(this.sessionStartedAt).toISOString().slice(0, 13);
  }
}

/** @typedef {{
  agent_id: string,
  first_seen_at: number,
  last_seen_at: number,
  writes_total: number,
  reads_total: number,
  writes_by_tier: Record<string, number>,
  lineage_growth_total: number,
  sovereign_preferences_read_in_session: Record<string, boolean>,
  nudges_emitted: number,
  last_observation: string|null,
}} AgentLedger */
