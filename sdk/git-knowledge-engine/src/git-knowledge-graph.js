import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Git-specific node types for the sovereign knowledge graph.
 * @readonly
 */
export const GIT_NODE_TYPES = new Set([
  'repository',   // root repo node
  'file',         // any indexed source file
  'commit',       // git commit record
  'author',       // contributor identity
  'branch',       // git branch
  'protocol',     // X ecosystem protocol file
  'schema',       // JSON/YAML schema definition
  'mission',      // identified mission definition
  'governance',   // governance rule or policy
  'microbot',     // microbot definition
  'sdk-module',   // SDK module directory
  'dependency',   // inferred import target
]);

/**
 * Typed edge relations between nodes.
 * @readonly
 */
export const GIT_EDGE_TYPES = new Set([
  'contains',     // repo → file, sdk-module → file
  'imports',      // file → dependency
  'authored',     // author → commit
  'modifies',     // commit → file
  'implements',   // file → protocol
  'governed_by',  // file/mission → governance
  'references',   // generic cross-reference
  'belongs_to',   // file → sdk-module / branch
]);

/**
 * GitKnowledgeGraph — a sovereign, in-memory, typed knowledge graph
 * built from a Git repository index. Every node is addressable, every
 * edge is typed, and the full graph is exportable for downstream missions.
 */
export class GitKnowledgeGraph {
  /** @type {Map<string, object>} nodeId → node */
  #nodes = new Map();

  /** @type {Map<string, object>} edgeId → edge */
  #edges = new Map();

  /** @type {Map<string, Set<string>>} nodeId → edgeId[] */
  #adjacency = new Map();

  /** @type {string | null} */
  #repoNodeId = null;

  // ---------------------------------------------------------------------------
  // Build from index
  // ---------------------------------------------------------------------------

  /**
   * Populate the graph from a GitIndexer result.
   * @param {{ meta: object, files: object[], commits: object[], branches: string[], keyFiles: object[] }} index
   */
  buildFromIndex(index) {
    const { meta, files, commits, branches } = index;

    // Root node
    const repoId = this.#addNode('repository', {
      name:          meta.name,
      root:          meta.root,
      currentBranch: meta.currentBranch,
      totalFiles:    meta.totalFiles,
      indexedAt:     meta.indexedAt,
      byCategory:    meta.byCategory,
    });
    this.#repoNodeId = repoId;

    // Branch nodes + edges
    const branchNodes = {};
    for (const b of (branches ?? [])) {
      const bId = this.#addNode('branch', { name: b });
      branchNodes[b] = bId;
      this.#addEdge(repoId, bId, 'contains');
    }

    // File nodes + edges
    const fileNodeMap = {};  // relPath → nodeId
    const sdkModules  = {};  // top-level sdk dir segment → nodeId

    for (const f of files) {
      const nodeType = this.#fileNodeType(f.category);
      const fileId   = this.#addNode(nodeType, {
        path:     f.path,
        name:     f.name,
        ext:      f.ext,
        size:     f.size,
        category: f.category,
        depth:    f.depth,
      });

      fileNodeMap[f.path] = fileId;

      // Repository contains every file
      this.#addEdge(repoId, fileId, 'contains');

      // Group sdk-module nodes
      if (f.category === 'sdk') {
        const seg = f.path.split('/').slice(0, 2).join('/');
        if (!sdkModules[seg]) {
          sdkModules[seg] = this.#addNode('sdk-module', { path: seg });
          this.#addEdge(repoId, sdkModules[seg], 'contains');
        }
        this.#addEdge(sdkModules[seg], fileId, 'contains');
      }

      // Branch membership (current branch only)
      if (meta.currentBranch && branchNodes[meta.currentBranch]) {
        this.#addEdge(fileId, branchNodes[meta.currentBranch], 'belongs_to');
      }
    }

    // Import relationships (parse files for import/require)
    this.#buildImportEdges(index, fileNodeMap);

    // Commit nodes + author nodes
    const authorMap = {};
    for (const c of (commits ?? [])) {
      const commitId = this.#addNode('commit', {
        hash:    c.hash,
        message: c.message,
        date:    c.date,
      });

      // Author nodes (deduplicated by email)
      if (c.email) {
        if (!authorMap[c.email]) {
          authorMap[c.email] = this.#addNode('author', {
            name:  c.author,
            email: c.email,
          });
        }
        this.#addEdge(authorMap[c.email], commitId, 'authored');
      }

      this.#addEdge(repoId, commitId, 'contains');
    }

    return this;
  }

  // ---------------------------------------------------------------------------
  // Query API
  // ---------------------------------------------------------------------------

  /**
   * Get the root repository node.
   * @returns {object | null}
   */
  getRepository() {
    if (!this.#repoNodeId) return null;
    return this.#getNodeWithEdges(this.#repoNodeId);
  }

  /**
   * Get all nodes of a given type.
   * @param {string} nodeType
   * @returns {object[]}
   */
  getByType(nodeType) {
    return [...this.#nodes.values()]
      .filter((n) => n.type === nodeType)
      .map((n) => ({ ...n }));
  }

  /**
   * Get all protocol nodes.
   * @returns {object[]}
   */
  getProtocols() {
    return this.getByType('protocol');
  }

  /**
   * Get all governance nodes.
   * @returns {object[]}
   */
  getGovernance() {
    return this.getByType('governance');
  }

  /**
   * Get all mission nodes.
   * @returns {object[]}
   */
  getMissions() {
    return this.getByType('mission');
  }

  /**
   * Get all SDK module nodes.
   * @returns {object[]}
   */
  getSdkModules() {
    return this.getByType('sdk-module');
  }

  /**
   * Find nodes whose properties match a predicate.
   * @param {(node: object) => boolean} predicate
   * @returns {object[]}
   */
  find(predicate) {
    return [...this.#nodes.values()].filter(predicate).map((n) => ({ ...n }));
  }

  /**
   * BFS traversal from a node up to maxDepth.
   * @param {string} nodeId
   * @param {{ relation?: string, maxDepth?: number }} [opts]
   * @returns {object[]}  Connected nodes and their edges
   */
  traverse(nodeId, { relation, maxDepth = 2 } = {}) {
    const visited  = new Set();
    const frontier = [{ id: nodeId, depth: 0 }];
    const result   = [];

    while (frontier.length > 0) {
      const { id, depth } = frontier.shift();
      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      for (const edgeId of (this.#adjacency.get(id) ?? new Set())) {
        const edge = this.#edges.get(edgeId);
        if (!edge) continue;
        if (relation && edge.relation !== relation) continue;

        const neighborId = edge.from === id ? edge.to : edge.from;
        const neighbor   = this.#nodes.get(neighborId);
        if (neighbor && !visited.has(neighborId)) {
          result.push({ node: { ...neighbor }, edge: { ...edge }, depth: depth + 1 });
          frontier.push({ id: neighborId, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Compute hub scores for all file-type nodes.
   * Score = outDegree * φ + inDegree  (mirrors GraphBuilderMicrobot)
   * @returns {Array<{ nodeId: string, path: string, type: string, score: number, inDegree: number, outDegree: number }>}
   */
  hubScores() {
    const PHI   = 1.618033988749895;
    const inDeg = {};
    const outDeg = {};

    for (const edge of this.#edges.values()) {
      outDeg[edge.from] = (outDeg[edge.from] ?? 0) + 1;
      inDeg[edge.to]    = (inDeg[edge.to]   ?? 0) + 1;
    }

    return [...this.#nodes.values()]
      .filter((n) => n.type === 'file' || GIT_NODE_TYPES.has(n.type))
      .map((n) => ({
        nodeId:    n.id,
        path:      n.properties.path ?? n.properties.name ?? n.id,
        type:      n.type,
        score:     parseFloat(((outDeg[n.id] ?? 0) * PHI + (inDeg[n.id] ?? 0)).toFixed(4)),
        inDegree:  inDeg[n.id]  ?? 0,
        outDegree: outDeg[n.id] ?? 0,
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Export the full graph as a serializable plain object.
   * @returns {{ nodes: object[], edges: object[], stats: object }}
   */
  export() {
    const nodes = [...this.#nodes.values()].map((n) => ({ ...n }));
    const edges = [...this.#edges.values()].map((e) => ({ ...e }));

    const typeCount = {};
    for (const n of nodes) typeCount[n.type] = (typeCount[n.type] ?? 0) + 1;

    return {
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        byType: typeCount,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Map a file category to the appropriate GIT_NODE_TYPES member.
   * @param {string} category
   * @returns {string}
   */
  #fileNodeType(category) {
    const map = {
      protocol:   'protocol',
      schema:     'schema',
      mission:    'mission',
      governance: 'governance',
      microbot:   'microbot',
    };
    return map[category] ?? 'file';
  }

  /**
   * Add a node and return its ID.
   * @param {string} type
   * @param {object} properties
   * @returns {string}
   */
  #addNode(type, properties = {}) {
    const id = crypto.randomUUID();
    this.#nodes.set(id, {
      id,
      type,
      properties: { ...properties },
      createdAt: new Date().toISOString(),
    });
    if (!this.#adjacency.has(id)) this.#adjacency.set(id, new Set());
    return id;
  }

  /**
   * Add a directed edge and return its ID.
   * @param {string} from
   * @param {string} to
   * @param {string} relation
   * @param {number} [weight=1.0]
   * @returns {string}
   */
  #addEdge(from, to, relation, weight = 1.0) {
    if (!this.#nodes.has(from) || !this.#nodes.has(to)) return null;

    const id = crypto.randomUUID();
    this.#edges.set(id, {
      id,
      from,
      to,
      relation,
      weight: Math.max(0, Math.min(1, weight)),
      createdAt: new Date().toISOString(),
    });
    this.#adjacency.get(from).add(id);
    if (!this.#adjacency.has(to)) this.#adjacency.set(to, new Set());
    this.#adjacency.get(to).add(id);
    return id;
  }

  /**
   * Get a node with its adjacency edges.
   * @param {string} id
   * @returns {{ node: object, edges: object[] } | null}
   */
  #getNodeWithEdges(id) {
    const node = this.#nodes.get(id);
    if (!node) return null;
    const edgeIds = this.#adjacency.get(id) ?? new Set();
    const edges   = [...edgeIds].map((eid) => this.#edges.get(eid)).filter(Boolean);
    return { node: { ...node }, edges };
  }

  /**
   * Parse import/require statements from file nodes and add 'imports' edges.
   * Lightweight regex-based — works for JS/TS/Python without a full AST.
   * @param {{ files: object[], keyFiles: object[] }} index
   * @param {Record<string, string>} fileNodeMap  relPath → nodeId
   */
  #buildImportEdges(index, fileNodeMap) {
    const { files } = index;

    const JS_IMPORT  = /(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;
    const PY_IMPORT  = /(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g;

    for (const f of files) {
      if (f.size > 200_000) continue; // skip very large files
      if (!['.js', '.mjs', '.ts', '.tsx', '.py'].includes(f.ext)) continue;

      let content;
      try {
        content = fs.readFileSync(path.join(index.meta?.root ?? '', f.path), 'utf8');
      } catch { continue; }

      const pattern = ['.py'].includes(f.ext) ? PY_IMPORT : JS_IMPORT;
      let match;

      while ((match = pattern.exec(content)) !== null) {
        const spec = (match[1] ?? match[2])?.trim();
        if (!spec) continue;

        // Resolve relative imports to a file path
        if (spec.startsWith('.')) {
          const dir     = path.dirname(f.path);
          const resolved = path.normalize(path.join(dir, spec));

          // Try exact match, then .js/.ts extensions
          const candidates = [
            resolved,
            resolved + '.js',
            resolved + '.ts',
            resolved + '/index.js',
            resolved + '/index.ts',
          ];

          for (const c of candidates) {
            const targetId = fileNodeMap[c];
            if (targetId) {
              this.#addEdge(fileNodeMap[f.path], targetId, 'imports', 0.8);
              break;
            }
          }
        }
        // Absolute/package imports become dependency nodes (lightweight)
        else if (!spec.startsWith('#')) {
          const depId = `dep:${spec}`;
          if (!this.#nodes.has(depId)) {
            this.#nodes.set(depId, {
              id:         depId,
              type:       'dependency',
              properties: { name: spec, external: true },
              createdAt:  new Date().toISOString(),
            });
            this.#adjacency.set(depId, new Set());
          }
          if (fileNodeMap[f.path]) {
            this.#addEdge(fileNodeMap[f.path], depId, 'imports', 0.5);
          }
        }
      }
    }
  }
}

export default GitKnowledgeGraph;
