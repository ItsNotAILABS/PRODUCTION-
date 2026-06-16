// skills.mjs — registry of named skills callable through MCP.
// Each skill = { name, description, inputSchema, run(input, ctx) }.
// Builtins: legal artifacts (NDA, demand letter, contractor agreement, etc.).
// Operator can add custom skills at runtime via skills_register.

import { LEGAL_SKILLS } from './skills/legal.mjs';

export class SkillRegistry {
  constructor() {
    /** @type {Map<string, Skill>} */
    this.skills = new Map();
    this.runs   = [];   // last N runs for introspection
    this.maxRuns = 100;
    this._registerBuiltins();
  }

  _registerBuiltins() {
    for (const s of LEGAL_SKILLS) this.skills.set(s.name, s);
  }

  register(skill) {
    if (!skill?.name || typeof skill.run !== 'function')
      return { ok: false, reason: 'INVALID_SKILL' };
    this.skills.set(skill.name, skill);
    return { ok: true, name: skill.name };
  }

  list({ prefix } = {}) {
    return [...this.skills.values()]
      .filter(s => !prefix || s.name.startsWith(prefix))
      .map(s => ({
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema,
        builtin: LEGAL_SKILLS.some(b => b.name === s.name),
      }));
  }

  describe(name) {
    const s = this.skills.get(name);
    if (!s) return { ok: false, reason: 'SKILL_NOT_FOUND' };
    return { ok: true, ...this.list({ prefix: name }).find(x => x.name === name) };
  }

  run(name, input = {}, ctx = {}) {
    const s = this.skills.get(name);
    if (!s) return { ok: false, reason: 'SKILL_NOT_FOUND' };
    const t0 = Date.now();
    let result;
    try {
      result = s.run(input, ctx) ?? { ok: true };
    } catch (e) {
      result = { ok: false, reason: 'SKILL_THREW', message: e.message };
    }
    const record = {
      name, input_keys: Object.keys(input),
      ok: !!result.ok, reason: result.reason ?? null,
      ms: Date.now() - t0,
      ts: new Date().toISOString(),
      agent_id: ctx.agent_id ?? null,
    };
    this.runs.push(record);
    if (this.runs.length > this.maxRuns) this.runs.shift();
    return result;
  }

  history({ limit = 20, name } = {}) {
    const r = name ? this.runs.filter(x => x.name === name) : this.runs;
    return r.slice(-limit).reverse();
  }
}

/** @typedef {{
 *   name: string,
 *   description: string,
 *   inputSchema: object,
 *   run: (input: object, ctx?: object) => any,
 * }} Skill */
