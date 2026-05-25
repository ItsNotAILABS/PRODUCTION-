/**
 * ConfigBuilder — Fluent Builder for Configuration Objects
 *
 * A generic configuration builder that supports:
 * - Nested object structures
 * - Environment-specific overrides
 * - Validation schemas
 * - Merging and extending configs
 *
 * Example:
 *   const config = new ConfigBuilder()
 *     .set('app.name', 'My App')
 *     .set('app.port', 3000)
 *     .setEnv('production', 'app.debug', false)
 *     .setEnv('development', 'app.debug', true)
 *     .build('production');
 */

'use strict';

class ConfigBuilder {
  constructor() {
    this.config = {};
    this.envOverrides = {};
    this.defaults = {};
    this.validators = {};
    this.transformers = {};
  }

  /**
   * Set a configuration value using dot notation
   * @param {string} path - Dot-notation path (e.g., 'app.server.port')
   * @param {*} value - Configuration value
   * @returns {ConfigBuilder}
   */
  set(path, value) {
    this._setNestedValue(this.config, path, value);
    return this;
  }

  /**
   * Set a default value (used if not explicitly set)
   * @param {string} path - Dot-notation path
   * @param {*} value - Default value
   * @returns {ConfigBuilder}
   */
  setDefault(path, value) {
    this._setNestedValue(this.defaults, path, value);
    return this;
  }

  /**
   * Set multiple defaults from an object
   * @param {Object} defaults - Defaults object
   * @returns {ConfigBuilder}
   */
  setDefaults(defaults) {
    this.defaults = this._deepMerge(this.defaults, defaults);
    return this;
  }

  /**
   * Set an environment-specific override
   * @param {string} env - Environment name (e.g., 'production', 'development')
   * @param {string} path - Dot-notation path
   * @param {*} value - Value for this environment
   * @returns {ConfigBuilder}
   */
  setEnv(env, path, value) {
    if (!this.envOverrides[env]) {
      this.envOverrides[env] = {};
    }
    this._setNestedValue(this.envOverrides[env], path, value);
    return this;
  }

  /**
   * Set multiple values for an environment
   * @param {string} env - Environment name
   * @param {Object} overrides - Override values
   * @returns {ConfigBuilder}
   */
  setEnvOverrides(env, overrides) {
    if (!this.envOverrides[env]) {
      this.envOverrides[env] = {};
    }
    this.envOverrides[env] = this._deepMerge(this.envOverrides[env], overrides);
    return this;
  }

  /**
   * Get a configuration value
   * @param {string} path - Dot-notation path
   * @param {*} [defaultValue] - Default if not found
   * @returns {*}
   */
  get(path, defaultValue) {
    return this._getNestedValue(this.config, path) ?? defaultValue;
  }

  /**
   * Merge another config object into this one
   * @param {Object} config - Config to merge
   * @returns {ConfigBuilder}
   */
  merge(config) {
    this.config = this._deepMerge(this.config, config);
    return this;
  }

  /**
   * Extend from another ConfigBuilder
   * @param {ConfigBuilder} other - Another ConfigBuilder instance
   * @returns {ConfigBuilder}
   */
  extend(other) {
    this.config = this._deepMerge(this.config, other.config);
    this.defaults = this._deepMerge(this.defaults, other.defaults);

    for (const [env, overrides] of Object.entries(other.envOverrides)) {
      if (!this.envOverrides[env]) {
        this.envOverrides[env] = {};
      }
      this.envOverrides[env] = this._deepMerge(this.envOverrides[env], overrides);
    }

    return this;
  }

  /**
   * Add a validator for a config path
   * @param {string} path - Dot-notation path
   * @param {Function} validator - Validation function (returns true or error string)
   * @returns {ConfigBuilder}
   */
  addValidator(path, validator) {
    this.validators[path] = validator;
    return this;
  }

  /**
   * Add a transformer for a config path
   * @param {string} path - Dot-notation path
   * @param {Function} transformer - Transform function (value => transformedValue)
   * @returns {ConfigBuilder}
   */
  addTransformer(path, transformer) {
    this.transformers[path] = transformer;
    return this;
  }

  /**
   * Enable a feature flag
   * @param {string} feature - Feature name
   * @param {boolean} [enabled=true] - Whether enabled
   * @returns {ConfigBuilder}
   */
  enableFeature(feature, enabled = true) {
    return this.set(`features.${feature}`, enabled);
  }

  /**
   * Disable a feature flag
   * @param {string} feature - Feature name
   * @returns {ConfigBuilder}
   */
  disableFeature(feature) {
    return this.enableFeature(feature, false);
  }

  /**
   * Use a preset configuration
   * @param {string} preset - Preset name
   * @returns {ConfigBuilder}
   */
  usePreset(preset) {
    switch (preset) {
      case 'organism':
        return this
          .setDefaults({
            organism: {
              heartbeat: 873,
              phi: 1.618033988749895,
              version: '1.0.0',
            },
            features: {
              logging: true,
              metrics: true,
              tracing: false,
            },
          })
          .setEnv('production', 'features.tracing', true)
          .setEnv('production', 'organism.debug', false)
          .setEnv('development', 'organism.debug', true);

      case 'extension':
        return this
          .setDefaults({
            extension: {
              manifestVersion: 3,
              minimumChromeVersion: '116',
            },
            permissions: [],
            features: {
              sidePanel: false,
              devtools: false,
            },
          });

      case 'sdk':
        return this
          .setDefaults({
            sdk: {
              type: 'module',
              nodeVersion: '>=18.0.0',
            },
            build: {
              target: 'es2022',
              minify: false,
            },
          })
          .setEnv('production', 'build.minify', true);

      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }

  /**
   * Validate the current configuration
   * @param {string} [env] - Optional environment to validate against
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(env) {
    const errors = [];
    const finalConfig = env ? this.build(env) : this._buildInternal();

    for (const [path, validator] of Object.entries(this.validators)) {
      const value = this._getNestedValue(finalConfig, path);
      const result = validator(value);

      if (result !== true) {
        errors.push(typeof result === 'string' ? result : `Invalid value at ${path}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build the final configuration for a specific environment
   * @param {string} [env] - Environment name (e.g., 'production')
   * @returns {Object} - Final merged configuration
   */
  build(env) {
    let result = this._buildInternal();

    // Apply environment overrides
    if (env && this.envOverrides[env]) {
      result = this._deepMerge(result, this.envOverrides[env]);
    }

    // Apply transformers
    for (const [path, transformer] of Object.entries(this.transformers)) {
      const value = this._getNestedValue(result, path);
      if (value !== undefined) {
        this._setNestedValue(result, path, transformer(value));
      }
    }

    // Validate
    const { valid, errors } = this.validate();
    if (!valid) {
      throw new Error(`Invalid configuration: ${errors.join(', ')}`);
    }

    return result;
  }

  /**
   * Build configuration without environment overrides
   * @returns {Object}
   * @private
   */
  _buildInternal() {
    return this._deepMerge(this.defaults, this.config);
  }

  /**
   * Set a value using dot notation
   * @param {Object} obj - Target object
   * @param {string} path - Dot-notation path
   * @param {*} value - Value to set
   * @private
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Get a value using dot notation
   * @param {Object} obj - Source object
   * @param {string} path - Dot-notation path
   * @returns {*}
   * @private
   */
  _getNestedValue(obj, path) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current == null || !(key in current)) {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object}
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this._deepMerge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Export configuration to JSON string
   * @param {string} [env] - Environment
   * @param {number} [indent=2] - JSON indentation
   * @returns {string}
   */
  toJSON(env, indent = 2) {
    return JSON.stringify(this.build(env), null, indent);
  }

  /**
   * Create a ConfigBuilder from an existing config object
   * @param {Object} config - Existing configuration
   * @returns {ConfigBuilder}
   */
  static fromObject(config) {
    const builder = new ConfigBuilder();
    builder.config = JSON.parse(JSON.stringify(config));
    return builder;
  }

  /**
   * Create a ConfigBuilder from a JSON string
   * @param {string} json - JSON string
   * @returns {ConfigBuilder}
   */
  static fromJSON(json) {
    return ConfigBuilder.fromObject(JSON.parse(json));
  }
}

module.exports = ConfigBuilder;
