/**
 * SDKBuilder — Fluent Builder for SDK Packages
 *
 * Creates SDK package configurations (package.json, structure, exports)
 * using the builder pattern for consistent SDK development.
 *
 * Example:
 *   const sdk = new SDKBuilder()
 *     .setName('@medina/my-sdk')
 *     .setVersion('1.0.0')
 *     .setDescription('My SDK description')
 *     .addExport('.', './src/index.js')
 *     .addExport('./utils', './src/utils.js')
 *     .addDependency('lodash', '^4.17.21')
 *     .build();
 */

'use strict';

class SDKBuilder {
  constructor() {
    this.config = {
      name: '',
      version: '1.0.0',
      description: '',
      license: 'MIT',
      type: 'module',
      main: 'src/index.js',
      exports: {},
      keywords: [],
      files: ['src/'],
      engines: {
        node: '>=18.0.0',
      },
      author: 'Medina',
      publishConfig: {
        access: 'public',
      },
    };
    this.dependencies = {};
    this.devDependencies = {};
    this.sourceFiles = {};
  }

  /**
   * Set SDK name (should follow @medina/name pattern)
   * @param {string} name - Package name
   * @returns {SDKBuilder}
   */
  setName(name) {
    this.config.name = name;
    return this;
  }

  /**
   * Set SDK version
   * @param {string} version - Semantic version
   * @returns {SDKBuilder}
   */
  setVersion(version) {
    this.config.version = version;
    return this;
  }

  /**
   * Set SDK description
   * @param {string} description - Package description
   * @returns {SDKBuilder}
   */
  setDescription(description) {
    this.config.description = description;
    return this;
  }

  /**
   * Set SDK license
   * @param {string} license - License type (e.g., 'MIT', 'Apache-2.0')
   * @returns {SDKBuilder}
   */
  setLicense(license) {
    this.config.license = license;
    return this;
  }

  /**
   * Set module type
   * @param {string} type - Module type ('module' or 'commonjs')
   * @returns {SDKBuilder}
   */
  setType(type) {
    this.config.type = type;
    return this;
  }

  /**
   * Set main entry point
   * @param {string} main - Main entry file
   * @returns {SDKBuilder}
   */
  setMain(main) {
    this.config.main = main;
    return this;
  }

  /**
   * Add an export mapping
   * @param {string} key - Export key (e.g., '.', './utils')
   * @param {string} value - Export path (e.g., './src/index.js')
   * @returns {SDKBuilder}
   */
  addExport(key, value) {
    this.config.exports[key] = value;
    return this;
  }

  /**
   * Add multiple exports
   * @param {Object} exports - Export mappings
   * @returns {SDKBuilder}
   */
  addExports(exports) {
    Object.assign(this.config.exports, exports);
    return this;
  }

  /**
   * Add a keyword
   * @param {string} keyword - Keyword
   * @returns {SDKBuilder}
   */
  addKeyword(keyword) {
    if (!this.config.keywords.includes(keyword)) {
      this.config.keywords.push(keyword);
    }
    return this;
  }

  /**
   * Add multiple keywords
   * @param {string[]} keywords - Keywords array
   * @returns {SDKBuilder}
   */
  addKeywords(keywords) {
    for (const kw of keywords) {
      this.addKeyword(kw);
    }
    return this;
  }

  /**
   * Set files to include in package
   * @param {string[]} files - File/directory patterns
   * @returns {SDKBuilder}
   */
  setFiles(files) {
    this.config.files = files;
    return this;
  }

  /**
   * Set author
   * @param {string} author - Author name or object
   * @returns {SDKBuilder}
   */
  setAuthor(author) {
    this.config.author = author;
    return this;
  }

  /**
   * Set repository info
   * @param {string} type - Repository type (e.g., 'git')
   * @param {string} url - Repository URL
   * @param {string} [directory] - Directory within repo
   * @returns {SDKBuilder}
   */
  setRepository(type, url, directory) {
    this.config.repository = { type, url };
    if (directory) {
      this.config.repository.directory = directory;
    }
    return this;
  }

  /**
   * Add a dependency
   * @param {string} name - Package name
   * @param {string} version - Version range
   * @returns {SDKBuilder}
   */
  addDependency(name, version) {
    this.dependencies[name] = version;
    return this;
  }

  /**
   * Add multiple dependencies
   * @param {Object} deps - Dependencies object
   * @returns {SDKBuilder}
   */
  addDependencies(deps) {
    Object.assign(this.dependencies, deps);
    return this;
  }

  /**
   * Add a dev dependency
   * @param {string} name - Package name
   * @param {string} version - Version range
   * @returns {SDKBuilder}
   */
  addDevDependency(name, version) {
    this.devDependencies[name] = version;
    return this;
  }

  /**
   * Add multiple dev dependencies
   * @param {Object} deps - Dev dependencies object
   * @returns {SDKBuilder}
   */
  addDevDependencies(deps) {
    Object.assign(this.devDependencies, deps);
    return this;
  }

  /**
   * Set Node.js engine requirement
   * @param {string} version - Node version range
   * @returns {SDKBuilder}
   */
  setNodeEngine(version) {
    this.config.engines.node = version;
    return this;
  }

  /**
   * Set scripts
   * @param {Object} scripts - Scripts object
   * @returns {SDKBuilder}
   */
  setScripts(scripts) {
    this.config.scripts = scripts;
    return this;
  }

  /**
   * Add a script
   * @param {string} name - Script name
   * @param {string} command - Script command
   * @returns {SDKBuilder}
   */
  addScript(name, command) {
    if (!this.config.scripts) {
      this.config.scripts = {};
    }
    this.config.scripts[name] = command;
    return this;
  }

  /**
   * Add a source file
   * @param {string} path - File path within the SDK
   * @param {string} content - File content
   * @returns {SDKBuilder}
   */
  addSourceFile(path, content) {
    this.sourceFiles[path] = content;
    return this;
  }

  /**
   * Use a preset configuration
   * @param {string} preset - Preset name ('minimal', 'standard', 'organism')
   * @returns {SDKBuilder}
   */
  usePreset(preset) {
    switch (preset) {
      case 'minimal':
        return this
          .setType('module')
          .setMain('src/index.js')
          .addExport('.', './src/index.js')
          .addKeywords(['organism', 'sdk']);

      case 'standard':
        return this
          .setType('module')
          .setMain('src/index.js')
          .addExport('.', './src/index.js')
          .addKeywords(['organism', 'sdk', 'AI'])
          .setRepository('git', 'git+https://github.com/FreddyCreates/potential-succotash.git');

      case 'organism':
        return this
          .setType('module')
          .setMain('src/index.js')
          .addExport('.', './src/index.js')
          .addKeywords(['organism', 'runtime', 'autonomous', 'AI', 'heartbeat', 'kernel', 'edge', 'sovereign'])
          .setRepository('git', 'git+https://github.com/FreddyCreates/potential-succotash.git')
          .setNodeEngine('>=18.0.0');

      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }

  /**
   * Validate the SDK configuration
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.config.name) {
      errors.push('SDK name is required');
    }

    if (!this.config.version) {
      errors.push('SDK version is required');
    }

    if (!this.config.main) {
      errors.push('Main entry point is required');
    }

    if (Object.keys(this.config.exports).length === 0) {
      errors.push('At least one export is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build the final package.json object
   * @returns {Object} - Complete package.json configuration
   */
  build() {
    const { valid, errors } = this.validate();
    if (!valid) {
      throw new Error(`Invalid SDK configuration: ${errors.join(', ')}`);
    }

    const pkg = { ...this.config };

    // Add dependencies if any
    if (Object.keys(this.dependencies).length > 0) {
      pkg.dependencies = this.dependencies;
    }

    if (Object.keys(this.devDependencies).length > 0) {
      pkg.devDependencies = this.devDependencies;
    }

    // Clean up empty arrays
    if (pkg.keywords.length === 0) {
      delete pkg.keywords;
    }

    return pkg;
  }

  /**
   * Build and return package.json with associated source files
   * @returns {{ packageJson: Object, files: Object }}
   */
  buildWithFiles() {
    return {
      packageJson: this.build(),
      files: this.sourceFiles,
    };
  }

  /**
   * Create a new builder from an existing package.json
   * @param {Object} pkg - Existing package.json object
   * @returns {SDKBuilder}
   */
  static fromPackageJson(pkg) {
    const builder = new SDKBuilder();
    builder.config = { ...pkg };
    if (pkg.dependencies) {
      builder.dependencies = { ...pkg.dependencies };
    }
    if (pkg.devDependencies) {
      builder.devDependencies = { ...pkg.devDependencies };
    }
    return builder;
  }
}

module.exports = SDKBuilder;
