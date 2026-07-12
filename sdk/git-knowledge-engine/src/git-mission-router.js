import crypto from 'node:crypto';

/**
 * Mission types the GitKnowledgeEngine can execute.
 * Each maps to a handler in GitExecutor.
 * @readonly
 */
export const MISSION_TYPES = {
  /** Full repository scan — returns the complete knowledge graph export. */
  SCAN: 'scan',

  /** Dependency trace — returns import graph and hub scores. */
  TRACE: 'trace',

  /** Protocol audit — lists all protocol nodes with metadata. */
  AUDIT_PROTOCOLS: 'audit-protocols',

  /** Governance audit — lists governance rules and policy coverage. */
  AUDIT_GOVERNANCE: 'audit-governance',

  /** Knowledge digest — produces a human-readable summary of the repo. */
  DIGEST: 'digest',

  /** Entry surface — identifies entry points (index.js, __init__.py, main files). */
  ENTRY_SURFACE: 'entry-surface',

  /** Schema extraction — returns all schema definitions found in the repo. */
  EXTRACT_SCHEMAS: 'extract-schemas',

  /** Mission detection — identifies mission definitions inside the repo. */
  DETECT_MISSIONS: 'detect-missions',

  /** Contributor map — returns authors, commit counts, and recency. */
  CONTRIBUTOR_MAP: 'contributor-map',

  /** SDK surface — lists SDK modules and their public exports. */
  SDK_SURFACE: 'sdk-surface',
};

/**
 * Risk levels that control governance approval requirements.
 * @readonly
 */
const RISK = {
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
};

/**
 * Mission metadata table.
 * Governs routing behaviour, risk, and required inputs.
 * @readonly
 */
const MISSION_META = {
  [MISSION_TYPES.SCAN]: {
    risk: RISK.LOW,
    description: 'Full repository scan producing a complete knowledge graph.',
    requiredInputs: [],
  },
  [MISSION_TYPES.TRACE]: {
    risk: RISK.LOW,
    description: 'Dependency trace with hub score ranking.',
    requiredInputs: [],
  },
  [MISSION_TYPES.AUDIT_PROTOCOLS]: {
    risk: RISK.LOW,
    description: 'Audit all X-ecosystem protocol files in the repo.',
    requiredInputs: [],
  },
  [MISSION_TYPES.AUDIT_GOVERNANCE]: {
    risk: RISK.LOW,
    description: 'Audit governance rules, policies, and coverage.',
    requiredInputs: [],
  },
  [MISSION_TYPES.DIGEST]: {
    risk: RISK.LOW,
    description: 'Produce a structured human-readable digest of the repository.',
    requiredInputs: [],
  },
  [MISSION_TYPES.ENTRY_SURFACE]: {
    risk: RISK.LOW,
    description: 'Identify all entry points (main files, index files, CLI files).',
    requiredInputs: [],
  },
  [MISSION_TYPES.EXTRACT_SCHEMAS]: {
    risk: RISK.LOW,
    description: 'Extract all schema definitions (JSON Schema, YAML schemas).',
    requiredInputs: [],
  },
  [MISSION_TYPES.DETECT_MISSIONS]: {
    risk: RISK.LOW,
    description: 'Detect mission definitions embedded in the repository.',
    requiredInputs: [],
  },
  [MISSION_TYPES.CONTRIBUTOR_MAP]: {
    risk: RISK.LOW,
    description: 'Map contributors, commit frequency, and recent activity.',
    requiredInputs: [],
  },
  [MISSION_TYPES.SDK_SURFACE]: {
    risk: RISK.LOW,
    description: 'List SDK modules with their public exports and file counts.',
    requiredInputs: [],
  },
};

/**
 * GitMissionRouter — validates, enriches, and routes missions from the
 * X ecosystem into the GitKnowledgeEngine executor. Every mission is a
 * sovereign object: typed, tenanted, logged, and governed.
 */
export class GitMissionRouter {
  /** @type {Map<string, object>} missionId → mission */
  #missions = new Map();

  /**
   * Create a mission object.
   * @param {string} type - One of MISSION_TYPES.*
   * @param {{ tenantId?: string, userId?: string, params?: object, tags?: string[] }} [opts]
   * @returns {object} Mission record
   */
  create(type, opts = {}) {
    const meta = MISSION_META[type];
    if (!meta) {
      throw new Error(
        `Unknown mission type "${type}". Valid types: ${Object.values(MISSION_TYPES).join(', ')}`,
      );
    }

    const { tenantId = 'default', userId = 'system', params = {}, tags = [] } = opts;

    const mission = {
      id:         crypto.randomUUID(),
      type,
      tenantId,
      userId,
      params,
      tags,
      risk:       meta.risk,
      description: meta.description,
      status:     'pending',
      createdAt:  new Date().toISOString(),
      startedAt:  null,
      completedAt: null,
      result:     null,
      error:      null,
    };

    this.#missions.set(mission.id, mission);
    return mission;
  }

  /**
   * Mark a mission as started and return the updated record.
   * @param {string} missionId
   * @returns {object}
   */
  start(missionId) {
    const m = this.#require(missionId);
    m.status    = 'running';
    m.startedAt = new Date().toISOString();
    return { ...m };
  }

  /**
   * Mark a mission as completed with a result.
   * @param {string} missionId
   * @param {*} result
   * @returns {object}
   */
  complete(missionId, result) {
    const m = this.#require(missionId);
    m.status      = 'completed';
    m.completedAt = new Date().toISOString();
    m.result      = result;
    return { ...m };
  }

  /**
   * Mark a mission as failed with an error.
   * @param {string} missionId
   * @param {string} errorMessage
   * @returns {object}
   */
  fail(missionId, errorMessage) {
    const m = this.#require(missionId);
    m.status      = 'failed';
    m.completedAt = new Date().toISOString();
    m.error       = errorMessage;
    return { ...m };
  }

  /**
   * List all missions, optionally filtered by status.
   * @param {{ status?: string, tenantId?: string }} [filter]
   * @returns {object[]}
   */
  list(filter = {}) {
    let missions = [...this.#missions.values()];
    if (filter.status)   missions = missions.filter((m) => m.status   === filter.status);
    if (filter.tenantId) missions = missions.filter((m) => m.tenantId === filter.tenantId);
    return missions.map((m) => ({ ...m }));
  }

  /**
   * Get a single mission by ID.
   * @param {string} missionId
   * @returns {object | null}
   */
  get(missionId) {
    const m = this.#missions.get(missionId);
    return m ? { ...m } : null;
  }

  /**
   * Return the mission type registry (read-only).
   * @returns {object}
   */
  static get types() {
    return { ...MISSION_TYPES };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #require(missionId) {
    const m = this.#missions.get(missionId);
    if (!m) throw new Error(`Mission not found: ${missionId}`);
    return m;
  }
}

export default GitMissionRouter;
