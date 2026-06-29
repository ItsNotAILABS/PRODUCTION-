/**
 * PROTO-I024: Skill Composition Protocol (SCP2)
 * Derives from: IntegrationOrchestrationProtocol, MCPGatewayProtocol
 * Register and compose intelligent skill agents into multi-step workflows
 * with sequential, parallel, or phi-priority execution strategies.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export const SKILL_STRATEGY = Object.freeze({
  SEQUENTIAL   : 'sequential',
  PARALLEL     : 'parallel',
  PHI_PRIORITY : 'phi_priority',
});

export class SkillCompositionProtocol {
  #skills = new Map(); // name → { execute, description, inputSchema, outputSchema, callCount }

  constructor(config = {}) {
    this.version = '1.0.0';
    this.domain  = 'integrations';
    this.metrics = { compositions: 0, executions: 0, errors: 0 };
  }

  /**
   * Register a skill agent.
   * @param {string} name
   * @param {{ execute: AsyncFunction, description, inputSchema, outputSchema }} opts
   */
  register(name, { execute, description = '', inputSchema = {}, outputSchema = {} } = {}) {
    if (typeof execute !== 'function') throw new Error(`Skill "${name}" must provide an execute function`);
    this.#skills.set(name, { execute, description, inputSchema, outputSchema, callCount: 0 });
    return { name, description };
  }

  /**
   * Compose a set of skills into a runnable workflow object.
   * @returns {{ execute: AsyncFunction, skillNames, strategy }}
   */
  compose(skillNames, strategy = SKILL_STRATEGY.SEQUENTIAL) {
    for (const name of skillNames) {
      if (!this.#skills.has(name)) throw new Error(`Unknown skill: ${name}`);
    }
    if (!Object.values(SKILL_STRATEGY).includes(strategy)) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    this.metrics.compositions++;
    return {
      execute    : async (input) => this.#runStrategy(skillNames, strategy, input),
      skillNames,
      strategy,
    };
  }

  /** Execute a composed skill workflow. */
  async execute(composedSkill, input) {
    this.metrics.executions++;
    try {
      return await composedSkill.execute(input);
    } catch (err) {
      this.metrics.errors++;
      throw err;
    }
  }

  /** List all registered skills as descriptors. */
  listSkills() {
    return [...this.#skills.entries()].map(([name, s]) => ({
      name,
      description : s.description,
      inputSchema : s.inputSchema,
      outputSchema: s.outputSchema,
      callCount   : s.callCount,
    }));
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  async #runStrategy(skillNames, strategy, input) {
    switch (strategy) {
      case SKILL_STRATEGY.SEQUENTIAL:   return this.#runSequential(skillNames, input);
      case SKILL_STRATEGY.PARALLEL:     return this.#runParallel(skillNames, input);
      case SKILL_STRATEGY.PHI_PRIORITY: return this.#runPhiPriority(skillNames, input);
      default: throw new Error(`Unhandled strategy: ${strategy}`);
    }
  }

  async #runSequential(skillNames, input) {
    const results = [];
    let current = input;
    for (const name of skillNames) {
      const skill  = this.#skills.get(name);
      const result = await skill.execute(current);
      skill.callCount++;
      results.push({ name, result });
      current = result;
    }
    return results;
  }

  async #runParallel(skillNames, input) {
    const settled = await Promise.allSettled(
      skillNames.map(async (name) => {
        const skill  = this.#skills.get(name);
        const result = await skill.execute(input);
        skill.callCount++;
        return { name, result };
      })
    );
    return settled.map((s) =>
      s.status === 'fulfilled' ? s.value : { name: '?', error: s.reason?.message }
    );
  }

  async #runPhiPriority(skillNames, input) {
    const prioritised = skillNames
      .map((name, i) => ({ name, priority: PHI_INV ** i }))
      .sort((a, b) => b.priority - a.priority);

    const results = [];
    for (const { name, priority } of prioritised) {
      const skill  = this.#skills.get(name);
      const result = await skill.execute(input);
      skill.callCount++;
      results.push({ name, priority: Math.round(priority * 1000) / 1000, result });
    }
    return results;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default SkillCompositionProtocol;
