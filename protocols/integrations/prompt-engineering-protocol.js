/**
 * PROTO-I027: Prompt Engineering Protocol (PEP)
 * Derives from: DataEnrichmentProtocol, IntegrationOrchestrationProtocol
 * Template management and phi-quality few-shot optimisation for LLM prompts.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class PromptEngineeringProtocol {
  #templates = new Map(); // name → { template, vars:[], usageCount }
  #examples  = new Map(); // name → [{ input, output, quality:0-1 }]

  constructor(config = {}) {
    this.version = '1.0.0';
    this.domain  = 'integrations';
    this.metrics = { prompts: 0, registrations: 0, exampleAdds: 0 };
  }

  /**
   * Register a prompt template with {{varName}} placeholders.
   * @param {string}   name
   * @param {string}   template  — text with {{var}} placeholders
   * @param {string[]} vars      — list of variable names
   */
  registerTemplate(name, template, vars = []) {
    this.#templates.set(name, { template, vars: [...vars], usageCount: 0 });
    if (!this.#examples.has(name)) this.#examples.set(name, []);
    this.metrics.registrations++;
    return { name, vars, placeholders: (template.match(/\{\{[^}]+\}\}/g) ?? []).length };
  }

  /**
   * Add a few-shot example for a template.
   * @param {string} templateName
   * @param {{ input, output, quality: number }} example  — quality in [0, 1]
   */
  registerExample(templateName, { input, output, quality = 0.5 } = {}) {
    if (!this.#templates.has(templateName)) throw new Error(`Unknown template: ${templateName}`);
    const examples = this.#examples.get(templateName);
    examples.push({ input, output, quality: Math.min(1, Math.max(0, quality)) });
    this.metrics.exampleAdds++;
    return { templateName, exampleCount: examples.length };
  }

  /**
   * Build a complete prompt by substituting vars, prepending few-shot examples,
   * and optionally appending chain-of-thought instruction.
   *
   * Examples are ranked by phi-quality weight: quality * PHI_INV^rank
   */
  buildPrompt(templateName, varValues = {}, { examples = 3, chainOfThought = false } = {}) {
    const tmpl = this.#templates.get(templateName);
    if (!tmpl) throw new Error(`Unknown template: ${templateName}`);

    // Substitute {{varName}} placeholders
    let body = tmpl.template;
    for (const [key, val] of Object.entries(varValues)) {
      body = body.replaceAll(`{{${key}}}`, String(val));
    }

    // Select top examples by phi-quality weight
    const allExamples = [...(this.#examples.get(templateName) ?? [])];
    const ranked = allExamples
      .map((ex, rank) => ({ ...ex, phiWeight: ex.quality * PHI_INV ** rank }))
      .sort((a, b) => b.phiWeight - a.phiWeight)
      .slice(0, examples);

    let prompt = '';
    if (ranked.length > 0) {
      prompt += ranked
        .map((ex, i) => `Example ${i + 1}:\nInput: ${ex.input}\nOutput: ${ex.output}`)
        .join('\n\n');
      prompt += '\n\n';
    }
    prompt += body;
    if (chainOfThought) prompt += "\n\nLet's think step by step.";

    tmpl.usageCount++;
    this.metrics.prompts++;
    return prompt;
  }

  /**
   * Return the best template name for a given task description,
   * scored by usageCount + avg quality of examples.
   */
  optimizeFor(task) {
    let bestName  = null;
    let bestScore = -Infinity;

    for (const [name, tmpl] of this.#templates) {
      const examples = this.#examples.get(name) ?? [];
      const avgQuality = examples.length === 0
        ? 0
        : examples.reduce((s, e) => s + e.quality, 0) / examples.length;
      const score = tmpl.usageCount * PHI_INV + avgQuality * PHI_INV ** 2;
      if (score > bestScore) { bestScore = score; bestName = name; }
    }

    return bestName;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default PromptEngineeringProtocol;
