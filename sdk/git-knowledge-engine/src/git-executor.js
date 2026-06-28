import fs from 'node:fs';
import path from 'node:path';
import { MISSION_TYPES } from './git-mission-router.js';

/**
 * Entry-point filename patterns.
 * @readonly
 */
const ENTRY_PATTERNS = [
  /^index\.(js|ts|mjs|py|java)$/,
  /^main\.(js|ts|mjs|py|java)$/,
  /^app\.(js|ts|mjs|py)$/,
  /^server\.(js|ts|mjs|py)$/,
  /^cli\.(js|ts|mjs|py)$/,
  /^__main__\.py$/,
  /^__init__\.py$/,
  /^bootstrap\.(js|ts|mjs|py)$/,
];

/**
 * GitExecutor — executes named missions against a pre-built GitKnowledgeGraph.
 * Each execute() call dispatches to a private handler by mission type, collects
 * results, and returns a structured payload suitable for X ecosystem consumption.
 */
export class GitExecutor {
  /** @type {import('./git-knowledge-graph.js').GitKnowledgeGraph} */
  #graph;

  /** @type {object} Raw index from GitIndexer */
  #index;

  /**
   * @param {import('./git-knowledge-graph.js').GitKnowledgeGraph} graph
   * @param {object} rawIndex - The raw index object produced by GitIndexer.index()
   */
  constructor(graph, rawIndex) {
    this.#graph = graph;
    this.#index = rawIndex;
  }

  /**
   * Execute a mission by type and return a result object.
   * @param {object} mission - A mission record from GitMissionRouter
   * @returns {Promise<object>} Structured result payload
   */
  async execute(mission) {
    const handler = this.#handlers[mission.type];
    if (!handler) {
      throw new Error(`No executor handler for mission type: "${mission.type}"`);
    }
    return handler.call(this, mission);
  }

  // ---------------------------------------------------------------------------
  // Mission handlers
  // ---------------------------------------------------------------------------

  #handlers = {

    [MISSION_TYPES.SCAN]: async function () {
      const exported = this.#graph.export();
      const repo     = this.#graph.getRepository();
      return {
        summary: {
          repoName:    repo?.node.properties.name,
          totalFiles:  repo?.node.properties.totalFiles,
          byCategory:  repo?.node.properties.byCategory,
          indexedAt:   repo?.node.properties.indexedAt,
        },
        graph: exported,
      };
    },

    [MISSION_TYPES.TRACE]: async function () {
      const scores = this.#graph.hubScores();
      const top20  = scores.slice(0, 20);

      // Find isolated nodes (no edges) among file types
      const isolated = this.#graph.find(
        (n) => ['file', 'protocol', 'schema'].includes(n.type),
      ).filter((n) => {
        const connected = this.#graph.traverse(n.id, { maxDepth: 1 });
        return connected.length === 0;
      }).slice(0, 20);

      return {
        topHubs:        top20,
        totalRanked:    scores.length,
        isolatedNodes:  isolated.length,
        isolatedSample: isolated.slice(0, 5).map((n) => n.properties.path),
      };
    },

    [MISSION_TYPES.AUDIT_PROTOCOLS]: async function () {
      const protocols = this.#graph.getProtocols();
      return {
        count:     protocols.length,
        protocols: protocols.map((p) => ({
          path:     p.properties.path,
          name:     p.properties.name,
          ext:      p.properties.ext,
          size:     p.properties.size,
          category: p.properties.category,
        })),
        coverage: this.#computeProtocolCoverage(protocols),
      };
    },

    [MISSION_TYPES.AUDIT_GOVERNANCE]: async function () {
      const gov = this.#graph.getGovernance();
      const byExt = {};
      for (const g of gov) {
        const ext = g.properties.ext ?? 'unknown';
        byExt[ext] = (byExt[ext] ?? 0) + 1;
      }
      return {
        count: gov.length,
        byExt,
        items: gov.map((g) => ({
          path:  g.properties.path,
          name:  g.properties.name,
          size:  g.properties.size,
        })),
        hasPolicies:   gov.some((g) => /polic/i.test(g.properties.name)),
        hasLaws:       gov.some((g) => /law/i.test(g.properties.name)),
        hasPipelines:  gov.some((g) => /pipeline/i.test(g.properties.name)),
        hasRegistry:   gov.some((g) => /registr/i.test(g.properties.name)),
      };
    },

    [MISSION_TYPES.DIGEST]: async function () {
      const repo   = this.#graph.getRepository()?.node.properties ?? {};
      const { meta, commits, branches, keyFiles } = this.#index;

      const topContributors = this.#topContributors(commits ?? [], 5);
      const latestCommit    = (commits ?? [])[0] ?? null;

      return {
        repository: {
          name:          repo.name,
          path:          repo.root,
          branch:        repo.currentBranch,
          totalFiles:    repo.totalFiles,
          byCategory:    repo.byCategory,
          totalBranches: branches?.length ?? 0,
        },
        latestCommit,
        topContributors,
        keyFiles: (keyFiles ?? []).map((kf) => ({
          path:    kf.path,
          size:    kf.size,
          preview: kf.content ? kf.content.slice(0, 500) : null,
        })),
        protocols:  this.#graph.getProtocols().length,
        governance: this.#graph.getGovernance().length,
        sdkModules: this.#graph.getSdkModules().length,
        missions:   this.#graph.getMissions().length,
      };
    },

    [MISSION_TYPES.ENTRY_SURFACE]: async function () {
      const { files, meta } = this.#index;
      const entryFiles = (files ?? []).filter((f) =>
        ENTRY_PATTERNS.some((p) => p.test(f.name)),
      );

      // Enrich with a short preview of file contents
      const enriched = entryFiles.slice(0, 30).map((f) => {
        let preview = null;
        try {
          const raw = fs.readFileSync(path.join(meta.root, f.path), 'utf8');
          preview = raw.slice(0, 300).trim();
        } catch { /* skip */ }
        return { ...f, preview };
      });

      return {
        count:   enriched.length,
        entries: enriched,
      };
    },

    [MISSION_TYPES.EXTRACT_SCHEMAS]: async function () {
      const schemas = this.#graph.find(
        (n) => n.type === 'schema' ||
               (n.type === 'file' && /\.json$/i.test(n.properties.ext ?? '')),
      );

      const enriched = schemas.slice(0, 50).map((s) => {
        let parsed = null;
        try {
          const raw = fs.readFileSync(
            path.join(this.#index.meta.root, s.properties.path ?? ''),
            'utf8',
          );
          if (raw.length < 50_000) parsed = JSON.parse(raw);
        } catch { /* skip */ }

        return {
          path:     s.properties.path,
          name:     s.properties.name,
          size:     s.properties.size,
          hasSchema: parsed ? (
            !!(parsed.$schema || parsed.type || parsed.properties)
          ) : false,
          topLevelKeys: parsed ? Object.keys(parsed).slice(0, 10) : [],
        };
      });

      return {
        count:   enriched.length,
        schemas: enriched,
      };
    },

    [MISSION_TYPES.DETECT_MISSIONS]: async function () {
      const missions = this.#graph.getMissions();
      const textSearch = this.#index.files?.filter(
        (f) => /mission/i.test(f.path),
      ) ?? [];

      return {
        graphMissions:  missions.length,
        pathMatches:    textSearch.length,
        missions: missions.map((m) => ({
          path: m.properties.path,
          name: m.properties.name,
          size: m.properties.size,
        })),
        pathMatchSample: textSearch.slice(0, 10).map((f) => f.path),
      };
    },

    [MISSION_TYPES.CONTRIBUTOR_MAP]: async function () {
      const commits = this.#index.commits ?? [];
      return {
        totalCommits:    commits.length,
        contributors:    this.#topContributors(commits, 20),
        recentActivity:  commits.slice(0, 10).map((c) => ({
          hash:    c.hash?.slice(0, 8),
          author:  c.author,
          date:    c.date,
          message: c.message?.slice(0, 80),
        })),
      };
    },

    [MISSION_TYPES.SDK_SURFACE]: async function () {
      const sdkModules = this.#graph.getSdkModules();
      const { files, meta } = this.#index;

      const modules = sdkModules.map((m) => {
        const modPath = m.properties.path;
        const modFiles = (files ?? []).filter((f) => f.path.startsWith(modPath + '/'));
        const hasIndex = modFiles.some((f) => f.name === 'index.js' || f.name === 'index.ts');
        const hasPkg   = modFiles.some((f) => f.name === 'package.json');

        return {
          path:       modPath,
          fileCount:  modFiles.length,
          hasIndex,
          hasPackageJson: hasPkg,
          categories: [...new Set(modFiles.map((f) => f.category))],
        };
      });

      return {
        count:   modules.length,
        modules,
      };
    },
  };

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute protocol coverage: what categories of protocols are present?
   * @param {object[]} protocols
   * @returns {object}
   */
  #computeProtocolCoverage(protocols) {
    const groups = {
      governance: 0,
      intelligence: 0,
      learning: 0,
      security: 0,
      organism: 0,
      other: 0,
    };

    for (const p of protocols) {
      const n = (p.properties.name ?? '').toLowerCase();
      if (/govern|charter|law|policy|sovereign/.test(n))  groups.governance++;
      else if (/intel|route|model|vein|wire/.test(n))     groups.intelligence++;
      else if (/learn|memory|hebbian|meta|evolv/.test(n)) groups.learning++;
      else if (/secure|crypto|cipher|encrypt/.test(n))    groups.security++;
      else if (/organism|lifecycl|arm|spawn/.test(n))     groups.organism++;
      else                                                  groups.other++;
    }

    return groups;
  }

  /**
   * Summarise top contributors from commit list.
   * @param {object[]} commits
   * @param {number} limit
   * @returns {Array<{ author: string, email: string, commits: number, latest: string }>}
   */
  #topContributors(commits, limit) {
    const map = {};
    for (const c of commits) {
      const key = c.email ?? c.author ?? 'unknown';
      if (!map[key]) {
        map[key] = { author: c.author, email: c.email, commits: 0, latest: c.date };
      }
      map[key].commits++;
      if (c.date > map[key].latest) map[key].latest = c.date;
    }
    return Object.values(map)
      .sort((a, b) => b.commits - a.commits)
      .slice(0, limit);
  }
}

export default GitExecutor;
