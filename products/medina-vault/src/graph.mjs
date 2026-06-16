// graph.mjs — session memory graph. Typed nodes + typed edges over the vault.
//
// Nodes:  entry / session / skill / agent / token / workflow / receipt
// Edges:  derived_from | called | used_key | minted | supersedes | observed | belongs_to
//
// Persisted in vault::_meta.graph as { nodes: {id->node}, edges: [{from,to,type,ts,...}] }.
// Cross-session continuity: every operator session creates a Session node; entries written
// during that session edge to it; the operator can ask "what did we decide about X" and
// traverse derived_from chains across all sessions on disk.

import { createHash } from 'node:crypto';

const NODE_KINDS = new Set(['entry','session','skill','agent','token','workflow','receipt']);
const EDGE_TYPES = new Set(['derived_from','called','used_key','minted','supersedes','observed','belongs_to']);

export class SessionGraph {
  constructor() {
    /** @type {Map<string, GraphNode>} */
    this.nodes = new Map();
    /** @type {GraphEdge[]} */
    this.edges = [];
    this.session = this._openSession();
  }

  _openSession() {
    const id = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    const node = {
      id, kind: 'session', label: id,
      ts: Date.now(),
      operator: process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || 'operator',
      hash: createHash('sha256').update(id + Date.now()).digest('hex').slice(0, 16),
    };
    this.nodes.set(id, node);
    return node;
  }

  loadFromMeta(meta) {
    if (!meta?.graph) return;
    if (Array.isArray(meta.graph.nodes)) for (const n of meta.graph.nodes) this.nodes.set(n.id, n);
    if (Array.isArray(meta.graph.edges)) this.edges.push(...meta.graph.edges);
  }

  toMeta() {
    return { graph: { nodes: [...this.nodes.values()], edges: this.edges } };
  }

  addNode({ id, kind, label, ...rest }) {
    if (!NODE_KINDS.has(kind)) return { ok: false, reason: 'INVALID_NODE_KIND' };
    const node = { id, kind, label: label ?? id, ts: Date.now(), ...rest };
    this.nodes.set(id, node);
    return { ok: true, node };
  }

  link(from, to, type, attrs = {}) {
    if (!EDGE_TYPES.has(type)) return { ok: false, reason: 'INVALID_EDGE_TYPE' };
    const edge = { from, to, type, ts: Date.now(), ...attrs };
    this.edges.push(edge);
    return { ok: true, edge };
  }

  /** Outbound neighbors of a node (or inbound if direction='in'). */
  neighbors(id, { direction = 'out', type, limit = 50 } = {}) {
    const out = [];
    for (const e of this.edges) {
      if (type && e.type !== type) continue;
      if (direction === 'out' && e.from === id) out.push({ ...e, node: this.nodes.get(e.to) });
      if (direction === 'in'  && e.to   === id) out.push({ ...e, node: this.nodes.get(e.from) });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** BFS shortest path between two nodes following any edge direction. */
  path(from, to, { maxDepth = 6 } = {}) {
    if (from === to) return { ok: true, path: [from], hops: 0 };
    const visited = new Set([from]);
    const queue = [[from, []]];
    while (queue.length) {
      const [cur, prev] = queue.shift();
      for (const e of this.edges) {
        const next = e.from === cur ? e.to : (e.to === cur ? e.from : null);
        if (!next || visited.has(next)) continue;
        const nextPath = [...prev, { node: cur, edge: e.type, to: next }];
        if (next === to) return { ok: true, path: nextPath, hops: nextPath.length };
        if (nextPath.length >= maxDepth) continue;
        visited.add(next);
        queue.push([next, nextPath]);
      }
    }
    return { ok: false, reason: 'NO_PATH', explored: visited.size };
  }

  search({ query, kind, limit = 25 } = {}) {
    const q = query?.toLowerCase();
    const out = [];
    for (const n of this.nodes.values()) {
      if (kind && n.kind !== kind) continue;
      if (q && !JSON.stringify(n).toLowerCase().includes(q)) continue;
      out.push(n);
      if (out.length >= limit) break;
    }
    return out;
  }

  stats() {
    const byKind = {};
    for (const n of this.nodes.values()) byKind[n.kind] = (byKind[n.kind] || 0) + 1;
    const byEdge = {};
    for (const e of this.edges) byEdge[e.type] = (byEdge[e.type] || 0) + 1;
    return {
      total_nodes: this.nodes.size,
      total_edges: this.edges.length,
      by_kind: byKind,
      by_edge_type: byEdge,
      current_session: this.session.id,
      current_session_hash: this.session.hash,
    };
  }
}

/** @typedef {{id:string,kind:string,label:string,ts:number}} GraphNode */
/** @typedef {{from:string,to:string,type:string,ts:number}} GraphEdge */
