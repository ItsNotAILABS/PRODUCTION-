// skills.mjs — registry of named skills callable through MCP.
// Each skill = { name, description, inputSchema, run(input, ctx) }.
// Domains: legal · memory · writing · code · comms · finance · data · research
// Custom skills can be registered at runtime via skills_register and
// persist into the vault as template skills (mustache fill).

import { LEGAL_SKILLS }    from './skills/legal.mjs';
import { WRITING_SKILLS }  from './skills/writing.mjs';
import { CODE_SKILLS }     from './skills/code.mjs';
import { COMMS_SKILLS }    from './skills/comms.mjs';
import { FINANCE_SKILLS }  from './skills/finance.mjs';
import { DATA_SKILLS }     from './skills/data.mjs';
import { RESEARCH_SKILLS } from './skills/research.mjs';
import { buildMemorySkills } from './skills/memory.mjs';

export class SkillRegistry {
  constructor({ vault, custos } = {}) {
    /** @type {Map<string, Skill>} */
    this.skills = new Map();
    this.runs   = [];   // last N runs for introspection
    this.maxRuns = 100;
    this._registerBuiltins({ vault, custos });
  }

  _registerBuiltins({ vault, custos }) {
    const batches = [
      LEGAL_SKILLS, WRITING_SKILLS, CODE_SKILLS, COMMS_SKILLS,
      FINANCE_SKILLS, DATA_SKILLS, RESEARCH_SKILLS,
    ];
    for (const batch of batches) for (const s of batch) this.skills.set(s.name, s);
    if (vault) {
      for (const s of buildMemorySkills({ vault, custos })) this.skills.set(s.name, s);
    }
  }

  /** Register a template skill at runtime (mustache-style ${field} fill on the template). */
  registerTemplate({ name, description, template, inputSchema }) {
    if (!name || !template) return { ok: false, reason: 'NAME_AND_TEMPLATE_REQUIRED' };
    const skill = {
      name, description: description || `Template skill: ${name}`,
      inputSchema: inputSchema || { type: 'object', properties: {} },
      run(input) {
        const out = String(template).replace(/\$\{([^}]+)\}/g, (_, k) => String(input[k] ?? ''));
        return { ok: true, kind: 'text', text: out };
      },
      template: true,
    };
    this.skills.set(name, skill);
    return { ok: true, name };
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
        domain: s.name.split('.')[0],
        template: !!s.template,
      }));
  }

  domains() {
    const counts = {};
    for (const s of this.skills.values()) {
      const d = s.name.split('.')[0];
      counts[d] = (counts[d] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }));
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
