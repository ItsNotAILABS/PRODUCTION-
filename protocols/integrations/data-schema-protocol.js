/**
 * PROTO-I008: Data Schema Protocol (DSP)
 * Derives from: DataNormalizationProtocol, PatternSynthesisProtocol
 * JSON schema validation, field mapping, and type coercion across integrations.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class DataSchemaProtocol {
  #schemas = new Map(); // name → jsonSchema

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.strict   = config.strict ?? false;
    this.metrics  = { validated: 0, passed: 0, failed: 0, mapped: 0 };
  }

  /** Register a JSON schema by name. */
  registerSchema(name, jsonSchema) {
    this.#schemas.set(name, jsonSchema);
    return { name, fields: Object.keys(jsonSchema.properties ?? {}).length };
  }

  /** Validate data against a registered schema. Returns {valid, errors[]}. */
  validate(schemaName, data) {
    const schema = this.#schemas.get(schemaName);
    if (!schema) throw new Error(`Schema not found: ${schemaName}`);
    this.metrics.validated++;
    const errors = this.#validateObj(data, schema, '');
    const valid  = errors.length === 0;
    valid ? this.metrics.passed++ : this.metrics.failed++;
    // phi-weighted quality score
    const score = valid ? PHI_INV + PHI_INV * (1 - errors.length / 10) : 0;
    return { valid, errors, score: parseFloat(Math.min(1, score).toFixed(4)) };
  }

  /** Map fields in data according to mapping rules [{from, to, transform?}]. */
  map(data, mappingRules = []) {
    const result = { ...data };
    for (const rule of mappingRules) {
      if (rule.from in result) {
        const val = typeof rule.transform === 'function' ? rule.transform(result[rule.from]) : result[rule.from];
        result[rule.to] = val;
        if (rule.from !== rule.to) delete result[rule.from];
      }
    }
    this.metrics.mapped++;
    return result;
  }

  /** Type-coerce fields in data according to schema. */
  coerce(data, schemaName) {
    const schema = this.#schemas.get(schemaName);
    if (!schema) throw new Error(`Schema not found: ${schemaName}`);
    const props = schema.properties ?? {};
    const out   = { ...data };
    for (const [field, def] of Object.entries(props)) {
      if (!(field in out)) continue;
      out[field] = this.#coerceField(out[field], def.type);
    }
    return out;
  }

  #validateObj(data, schema, path) {
    const errors = [];
    const props  = schema.properties ?? {};
    const req    = new Set(schema.required ?? []);
    for (const field of req) {
      if (data == null || !(field in data)) errors.push(`${path}${field} is required`);
    }
    if (data == null) return errors;
    for (const [field, def] of Object.entries(props)) {
      if (!(field in data)) continue;
      const val  = data[field];
      const fPath = `${path}${field}.`;
      if (def.type && !this.#typeCheck(val, def.type)) errors.push(`${path}${field} must be ${def.type}`);
      if (def.minimum !== undefined && val < def.minimum) errors.push(`${path}${field} < minimum ${def.minimum}`);
      if (def.maximum !== undefined && val > def.maximum) errors.push(`${path}${field} > maximum ${def.maximum}`);
      if (def.enum && !def.enum.includes(val)) errors.push(`${path}${field} not in enum`);
      if (def.type === 'object' && def.properties) errors.push(...this.#validateObj(val, def, fPath));
    }
    return errors;
  }

  #typeCheck(val, type) {
    if (type === 'string')  return typeof val === 'string';
    if (type === 'number')  return typeof val === 'number';
    if (type === 'boolean') return typeof val === 'boolean';
    if (type === 'array')   return Array.isArray(val);
    if (type === 'object')  return typeof val === 'object' && val !== null && !Array.isArray(val);
    return true;
  }

  #coerceField(val, type) {
    if (type === 'number')  return Number(val);
    if (type === 'string')  return String(val);
    if (type === 'boolean') return Boolean(val);
    return val;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default DataSchemaProtocol;
