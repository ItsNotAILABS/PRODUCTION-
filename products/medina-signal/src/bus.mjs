// bus.mjs — Sovereign signal bus for cross-AI handoff.
// Derived from ItsNotAILABS agent-signal (MIT). Adds: persistent JSON
// snapshot, role registry, priority-aware inbox query.

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const TYPES = ['BROADCAST', 'DIRECT', 'ROLE', 'URGENT'];
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const PRI = { LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 };

export function defaultBusPath() {
  return process.env.MEDINA_SIGNAL_PATH
      ?? join(homedir(), '.medina', 'signal.json');
}

export class SignalBus {
  constructor({ maxHistory = 5000 } = {}) {
    /** @type {Array<object>} */
    this.signals = [];
    /** @type {Map<string,string>} agentId -> role */
    this.roles = new Map();
    this.maxHistory = maxHistory;
  }

  // ── Roles ───────────────────────────────────────────────────────────

  register(agentId, role) {
    if (typeof agentId !== 'string' || !agentId) return { ok: false, reason: 'AGENT_ID_REQUIRED' };
    if (typeof role !== 'string' || !role)       return { ok: false, reason: 'ROLE_REQUIRED' };
    this.roles.set(agentId, role);
    return { ok: true, agentId, role };
  }

  roleOf(agentId) { return this.roles.get(agentId) ?? null; }

  // ── Emit ────────────────────────────────────────────────────────────

  emit({ from, subject, payload = null, type = 'BROADCAST',
         to = null, priority = 'NORMAL' } = {}) {
    if (typeof from !== 'string' || !from)      return { ok: false, reason: 'FROM_REQUIRED' };
    if (typeof subject !== 'string' || !subject) return { ok: false, reason: 'SUBJECT_REQUIRED' };
    if (!TYPES.includes(type))                  return { ok: false, reason: 'INVALID_TYPE' };
    if (!PRIORITIES.includes(priority))         return { ok: false, reason: 'INVALID_PRIORITY' };
    if ((type === 'DIRECT' || type === 'ROLE') && (typeof to !== 'string' || !to))
                                                return { ok: false, reason: 'TO_REQUIRED_FOR_DIRECT_OR_ROLE' };

    const signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      type, from, to, subject, payload, priority,
      read_by: [],
      ts: new Date().toISOString(),
    };
    this.signals.push(signal);
    if (this.signals.length > this.maxHistory) {
      this.signals.splice(0, this.signals.length - this.maxHistory);
    }
    return { ok: true, signal };
  }

  // ── Inbox ───────────────────────────────────────────────────────────

  inbox(agentId, { includeRead = false, minPriority, subjectPrefix, limit = 50 } = {}) {
    if (typeof agentId !== 'string' || !agentId) return { ok: false, reason: 'AGENT_ID_REQUIRED' };
    const role = this.roleOf(agentId);
    const minPri = minPriority ? PRI[minPriority] : -1;

    const matches = this.signals.filter(s => {
      if (!includeRead && s.read_by.includes(agentId)) return false;
      if (subjectPrefix && !s.subject.startsWith(subjectPrefix)) return false;
      if (PRI[s.priority] < minPri) return false;
      if (s.type === 'BROADCAST' || s.type === 'URGENT') return true;
      if (s.type === 'DIRECT') return s.to === agentId;
      if (s.type === 'ROLE')   return role !== null && s.to === role;
      return false;
    });

    matches.sort((a, b) =>
      PRI[b.priority] - PRI[a.priority] || b.ts.localeCompare(a.ts));

    return { ok: true, signals: matches.slice(0, limit), unread_total: matches.length };
  }

  // ── Read tracking ───────────────────────────────────────────────────

  markRead(agentId, signalId) {
    if (signalId) {
      const s = this.signals.find(x => x.id === signalId);
      if (!s) return { ok: false, reason: 'SIGNAL_NOT_FOUND' };
      if (!s.read_by.includes(agentId)) s.read_by.push(agentId);
      return { ok: true, marked: 1 };
    }
    // mark all addressed to this agent as read
    const role = this.roleOf(agentId);
    let n = 0;
    for (const s of this.signals) {
      if (s.read_by.includes(agentId)) continue;
      const addressed =
        s.type === 'BROADCAST' || s.type === 'URGENT' ||
        (s.type === 'DIRECT' && s.to === agentId) ||
        (s.type === 'ROLE'   && role && s.to === role);
      if (addressed) { s.read_by.push(agentId); n++; }
    }
    return { ok: true, marked: n };
  }

  // ── Queries ─────────────────────────────────────────────────────────

  history({ from, type, since, limit = 100 } = {}) {
    let out = this.signals;
    if (from)  out = out.filter(s => s.from === from);
    if (type)  out = out.filter(s => s.type === type);
    if (since) out = out.filter(s => s.ts >= since);
    return out.slice(-limit).reverse();
  }

  status() {
    return {
      total: this.signals.length,
      agents_registered: this.roles.size,
      types: TYPES,
      priorities: PRIORITIES,
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────

  toJSON() {
    return { protocol: 'MEDINA-PROTOCOL/0.1',
             roles: Array.from(this.roles.entries()),
             signals: this.signals };
  }
  loadFromJSON(snap) {
    if (!snap) return;
    if (Array.isArray(snap.signals)) this.signals = snap.signals;
    if (Array.isArray(snap.roles))   this.roles = new Map(snap.roles);
  }
}

export async function loadSnapshot(path = defaultBusPath()) {
  try { return JSON.parse(await fs.readFile(path, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function saveSnapshot(snap, path = defaultBusPath()) {
  await fs.mkdir(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(snap, null, 2), 'utf8');
  await fs.rename(tmp, path);
}
