// ai_registry.mjs — Directory of AIs that work inside Loom. Each AI has:
//   · agent_id        — stable identifier the gateway authenticates against
//   · display_name    — human label
//   · role            — what this AI does (architect, researcher, drafter, executor, ...)
//   · tier            — BASIC | STANDARD | ELEVATED | SOVEREIGN
//   · namespace       — vault prefix where their writes land (ai/<agent_id>/)
//   · capabilities    — list of tool patterns they can call (basic + tier expansion)
//   · status          — active | paused | revoked
//   · joined_at, last_seen, calls_total
//
// TIERS gate the gateway's exposed tool set:
//   BASIC      — read-only: vault_list, root_list, loom_status, engines_list, skills_list, knowledge_search
//   STANDARD   — BASIC + write to own namespace: vault_store, skills_run, engines_run, knowledge_mint
//   ELEVATED   — STANDARD + runspace exec (governed): runspace_*, root_write
//   SOVEREIGN  — full access (operator-issued only)

const TIER_CAPABILITIES = {
  BASIC: [
    'vault_list', 'root_list', 'loom_status', 'loom_status_proof',
    'engines_list', 'skills_list',
    'knowledge_search', 'knowledge_list', 'graph_search', 'receipts_list',
    'compression_stats', 'deposit_list', 'deposit_describe', 'deposit_stats',
  ],
  STANDARD: [
    // inherits BASIC + these
    'vault_store', 'vault_retrieve', 'skills_run', 'engines_run',
    'knowledge_mint', 'knowledge_unwrap',
    'workspace_focus', 'workspace_scratch', 'workspace_view',
    'plan_create', 'plan_advance', 'plan_next_actions',
    'session_close', 'session_resume_delta',
    'compression_apply', 'compression_expand',
    'deposit_create', 'deposit_get',  // every external AI needs to deposit its work
  ],
  ELEVATED: [
    // inherits STANDARD + these
    'runspace_create_job', 'runspace_write_file', 'runspace_exec_governed',
    'runspace_collect', 'runspace_persist_to_root',
    'root_read', 'root_write', 'root_search',
    'agents_dispatch', 'agents_status', 'agents_collect',
  ],
  SOVEREIGN: ['*'], // everything
};

const DEFAULT_TIER = 'STANDARD';

function expandCapabilities(tier) {
  const out = new Set();
  if (tier === 'SOVEREIGN') return ['*'];
  for (const t of ['BASIC', 'STANDARD', 'ELEVATED']) {
    if (TIER_CAPABILITIES[t]) for (const c of TIER_CAPABILITIES[t]) out.add(c);
    if (t === tier) break;
  }
  return [...out];
}

export class AIRegistry {
  constructor({ receipts } = {}) {
    this.receipts = receipts;
    /** @type {Map<string, AIRecord>} */
    this.ais = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.ai_registry?.ais) return;
    for (const a of meta.ai_registry.ais) this.ais.set(a.agent_id, a);
  }
  toMeta() { return { ai_registry: { ais: [...this.ais.values()] } }; }

  /** Register or update an AI. Returns the record. */
  register({ agent_id, display_name, role, tier, status = 'active' }) {
    if (!agent_id) return { ok: false, reason: 'AGENT_ID_REQUIRED' };
    const existing = this.ais.get(agent_id);
    const record = existing
      ? { ...existing, display_name: display_name ?? existing.display_name,
          role: role ?? existing.role, tier: tier ?? existing.tier,
          status, updated_at: Date.now() }
      : { agent_id, display_name: display_name || agent_id,
          role: role || 'unknown', tier: tier || DEFAULT_TIER,
          namespace: `ai/${agent_id}/`,
          status, joined_at: Date.now(), updated_at: Date.now(),
          last_seen: null, calls_total: 0 };
    this.ais.set(agent_id, record);
    this.receipts?.append({
      kind: existing ? 'agent_dispatched' : 'agent_dispatched',
      ref: `ai-registry:${agent_id}`, agent: 'system',
      meta: { action: existing ? 'updated' : 'registered',
              tier: record.tier, role: record.role },
    });
    return { ok: true, ...record, capabilities: expandCapabilities(record.tier) };
  }

  get(agent_id) {
    const r = this.ais.get(agent_id);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    return { ok: true, ...r, capabilities: expandCapabilities(r.tier) };
  }

  list() {
    return [...this.ais.values()].map(r => ({
      ...r, capabilities_count: expandCapabilities(r.tier).length,
    })).sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0));
  }

  touch(agent_id) {
    const r = this.ais.get(agent_id);
    if (!r) return false;
    r.last_seen = Date.now();
    r.calls_total = (r.calls_total || 0) + 1;
    return true;
  }

  setTier(agent_id, tier) {
    const r = this.ais.get(agent_id);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    if (!TIER_CAPABILITIES[tier]) return { ok: false, reason: 'INVALID_TIER', allowed: Object.keys(TIER_CAPABILITIES) };
    r.tier = tier;
    r.updated_at = Date.now();
    return { ok: true, agent_id, tier, capabilities: expandCapabilities(tier) };
  }

  revoke(agent_id) {
    const r = this.ais.get(agent_id);
    if (!r) return { ok: false, reason: 'NOT_FOUND' };
    r.status = 'revoked';
    r.updated_at = Date.now();
    return { ok: true, agent_id, status: 'revoked' };
  }

  /** Tool gate: returns true iff agent's tier permits this tool name. */
  permits(agent_id, tool_name) {
    const r = this.ais.get(agent_id);
    if (!r || r.status !== 'active') return false;
    const caps = expandCapabilities(r.tier);
    if (caps.includes('*')) return true;
    return caps.includes(tool_name);
  }

  static get TIER_CAPABILITIES() { return TIER_CAPABILITIES; }
}

/** @typedef {{agent_id:string,display_name:string,role:string,tier:string,namespace:string,status:string,joined_at:number,updated_at:number,last_seen:number|null,calls_total:number}} AIRecord */
