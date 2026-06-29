/**
 * PROTO-I028: Knowledge Graph Protocol (KGP)
 * Derives from: DataEnrichmentProtocol, IntegrationOrchestrationProtocol
 * Semantic knowledge graph with BFS traversal and phi-weighted PageRank.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class KnowledgeGraphProtocol {
  #nodes = new Map(); // id → { type, properties, rank }
  #edges = new Map(); // edgeId → { from, to, relation, weight }
  #edgeSeq = 0;

  constructor(config = {}) {
    this.version = '1.0.0';
    this.domain  = 'integrations';
    this.metrics = { nodes: 0, edges: 0, queries: 0 };
  }

  /** Add or update a node. Initial rank = PHI_INV. */
  addNode(id, type, properties = {}) {
    const existing = this.#nodes.get(id);
    if (existing) {
      existing.type       = type;
      existing.properties = { ...existing.properties, ...properties };
    } else {
      this.#nodes.set(id, { type, properties: { ...properties }, rank: PHI_INV });
      this.metrics.nodes++;
    }
    return { id, type };
  }

  /** Add an edge between two nodes (auto-generate edgeId). */
  addEdge(from, to, relation, weight = 1) {
    if (!this.#nodes.has(from)) throw new Error(`Unknown node: ${from}`);
    if (!this.#nodes.has(to))   throw new Error(`Unknown node: ${to}`);
    const edgeId = `e${++this.#edgeSeq}:${from}->${to}`;
    this.#edges.set(edgeId, { from, to, relation, weight });
    this.metrics.edges++;
    return { edgeId, from, to, relation, weight };
  }

  /**
   * BFS from a node up to given depth.
   * @returns {{ nodes, edges, paths }}
   */
  query(id, { depth = 1, relationFilter = null } = {}) {
    if (!this.#nodes.has(id)) throw new Error(`Unknown node: ${id}`);
    this.metrics.queries++;

    const visited    = new Set([id]);
    const nodesFound = new Map([[id, this.#nodes.get(id)]]);
    const edgesFound = new Map();
    const paths      = [[id]];
    let   frontier   = [id];

    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const nodeId of frontier) {
        for (const [edgeId, edge] of this.#edges) {
          const neighbour = edge.from === nodeId ? edge.to
                          : edge.to   === nodeId ? edge.from
                          : null;
          if (!neighbour) continue;
          if (relationFilter && edge.relation !== relationFilter) continue;
          edgesFound.set(edgeId, edge);
          if (!visited.has(neighbour)) {
            visited.add(neighbour);
            nodesFound.set(neighbour, this.#nodes.get(neighbour));
            next.push(neighbour);
            paths.push([...paths.find(p => p[p.length - 1] === nodeId) ?? [nodeId], neighbour]);
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }

    return {
      nodes: Object.fromEntries(nodesFound),
      edges: Object.fromEntries(edgesFound),
      paths,
    };
  }

  /** BFS shortest path between two nodes, returns array of node ids or null. */
  findPath(fromId, toId) {
    if (!this.#nodes.has(fromId) || !this.#nodes.has(toId)) return null;
    if (fromId === toId) return [fromId];

    const queue   = [[fromId]];
    const visited = new Set([fromId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];

      for (const edge of this.#edges.values()) {
        const neighbour = edge.from === curr ? edge.to
                        : edge.to   === curr ? edge.from
                        : null;
        if (!neighbour || visited.has(neighbour)) continue;
        const newPath = [...path, neighbour];
        if (neighbour === toId) return newPath;
        visited.add(neighbour);
        queue.push(newPath);
      }
    }

    return null;
  }

  /**
   * Compute phi-weighted rank for a node:
   * rank = PHI_INV * sum(incoming weights) + PHI_INV^2 * currentRank
   */
  getRank(id) {
    const node = this.#nodes.get(id);
    if (!node) throw new Error(`Unknown node: ${id}`);

    const incomingWeight = [...this.#edges.values()]
      .filter(e => e.to === id)
      .reduce((s, e) => s + e.weight, 0);

    node.rank = PHI_INV * incomingWeight + PHI_INV ** 2 * node.rank;
    return Math.round(node.rank * 10000) / 10000;
  }

  /**
   * Return direct neighbours of a node.
   * @param {string} direction — 'in' | 'out' | 'both'
   */
  getNeighbors(id, direction = 'both') {
    if (!this.#nodes.has(id)) throw new Error(`Unknown node: ${id}`);
    const neighbours = [];

    for (const [edgeId, edge] of this.#edges) {
      if ((direction === 'out' || direction === 'both') && edge.from === id) {
        neighbours.push({ id: edge.to, relation: edge.relation, direction: 'out', edgeId });
      }
      if ((direction === 'in' || direction === 'both') && edge.to === id) {
        neighbours.push({ id: edge.from, relation: edge.relation, direction: 'in', edgeId });
      }
    }
    return neighbours;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default KnowledgeGraphProtocol;
