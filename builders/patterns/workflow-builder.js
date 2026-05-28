/**
 * WorkflowBuilder — Fluent Builder for GitHub Actions Workflows
 *
 * Creates GitHub Actions workflow YAML configurations using
 * the builder pattern for consistent CI/CD automation.
 *
 * Example:
 *   const workflow = new WorkflowBuilder()
 *     .setName('CI')
 *     .onPush(['main'])
 *     .onPullRequest(['main'])
 *     .addJob('test', 'ubuntu-latest')
 *       .addStep('Checkout', 'actions/checkout@v4')
 *       .addStep('Setup Node', 'actions/setup-node@v4', { 'node-version': '20' })
 *       .addRunStep('Install', 'npm ci')
 *       .addRunStep('Test', 'npm test')
 *     .build();
 */

'use strict';

class WorkflowBuilder {
  constructor() {
    this.workflow = {
      name: '',
      on: {},
      jobs: {},
    };
    this.currentJob = null;
    this.currentJobName = null;
  }

  /**
   * Set workflow name
   * @param {string} name - Workflow name
   * @returns {WorkflowBuilder}
   */
  setName(name) {
    this.workflow.name = name;
    return this;
  }

  /**
   * Trigger on push to specific branches
   * @param {string[]} branches - Branch names
   * @param {string[]} [paths] - Optional path filters
   * @returns {WorkflowBuilder}
   */
  onPush(branches, paths) {
    this.workflow.on.push = { branches };
    if (paths) {
      this.workflow.on.push.paths = paths;
    }
    return this;
  }

  /**
   * Trigger on pull request to specific branches
   * @param {string[]} branches - Branch names
   * @param {string[]} [paths] - Optional path filters
   * @returns {WorkflowBuilder}
   */
  onPullRequest(branches, paths) {
    this.workflow.on.pull_request = { branches };
    if (paths) {
      this.workflow.on.pull_request.paths = paths;
    }
    return this;
  }

  /**
   * Trigger on schedule (cron)
   * @param {string} cron - Cron expression
   * @returns {WorkflowBuilder}
   */
  onSchedule(cron) {
    if (!this.workflow.on.schedule) {
      this.workflow.on.schedule = [];
    }
    this.workflow.on.schedule.push({ cron });
    return this;
  }

  /**
   * Trigger on workflow_dispatch (manual)
   * @param {Object} [inputs] - Optional inputs definition
   * @returns {WorkflowBuilder}
   */
  onWorkflowDispatch(inputs) {
    this.workflow.on.workflow_dispatch = inputs ? { inputs } : {};
    return this;
  }

  /**
   * Trigger on workflow_call (reusable workflow)
   * @param {Object} [inputs] - Optional inputs definition
   * @param {Object} [secrets] - Optional secrets definition
   * @returns {WorkflowBuilder}
   */
  onWorkflowCall(inputs, secrets) {
    this.workflow.on.workflow_call = {};
    if (inputs) {
      this.workflow.on.workflow_call.inputs = inputs;
    }
    if (secrets) {
      this.workflow.on.workflow_call.secrets = secrets;
    }
    return this;
  }

  /**
   * Set workflow permissions
   * @param {Object} permissions - Permissions object
   * @returns {WorkflowBuilder}
   */
  setPermissions(permissions) {
    this.workflow.permissions = permissions;
    return this;
  }

  /**
   * Set workflow environment variables
   * @param {Object} env - Environment variables
   * @returns {WorkflowBuilder}
   */
  setEnv(env) {
    this.workflow.env = env;
    return this;
  }

  /**
   * Set workflow concurrency
   * @param {string} group - Concurrency group
   * @param {boolean} [cancelInProgress=false] - Cancel in-progress runs
   * @returns {WorkflowBuilder}
   */
  setConcurrency(group, cancelInProgress = false) {
    this.workflow.concurrency = {
      group,
      'cancel-in-progress': cancelInProgress,
    };
    return this;
  }

  /**
   * Add a job (and switch to it for adding steps)
   * @param {string} name - Job name/id
   * @param {string} runsOn - Runner (e.g., 'ubuntu-latest')
   * @returns {WorkflowBuilder}
   */
  addJob(name, runsOn) {
    this.workflow.jobs[name] = {
      'runs-on': runsOn,
      steps: [],
    };
    this.currentJobName = name;
    this.currentJob = this.workflow.jobs[name];
    return this;
  }

  /**
   * Set job name/display
   * @param {string} displayName - Display name for job
   * @returns {WorkflowBuilder}
   */
  setJobName(displayName) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');
    this.currentJob.name = displayName;
    return this;
  }

  /**
   * Set job needs (dependencies)
   * @param {string|string[]} jobs - Job name(s) this job depends on
   * @returns {WorkflowBuilder}
   */
  setNeeds(jobs) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');
    this.currentJob.needs = Array.isArray(jobs) ? jobs : [jobs];
    return this;
  }

  /**
   * Set job condition
   * @param {string} condition - GitHub Actions condition expression
   * @returns {WorkflowBuilder}
   */
  setIf(condition) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');
    this.currentJob.if = condition;
    return this;
  }

  /**
   * Set job environment
   * @param {string} environment - Environment name
   * @returns {WorkflowBuilder}
   */
  setEnvironment(environment) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');
    this.currentJob.environment = environment;
    return this;
  }

  /**
   * Set job timeout
   * @param {number} minutes - Timeout in minutes
   * @returns {WorkflowBuilder}
   */
  setTimeoutMinutes(minutes) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');
    this.currentJob['timeout-minutes'] = minutes;
    return this;
  }

  /**
   * Set job strategy (matrix)
   * @param {Object} strategy - Strategy configuration
   * @returns {WorkflowBuilder}
   */
  setStrategy(strategy) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');
    this.currentJob.strategy = strategy;
    return this;
  }

  /**
   * Add a matrix strategy
   * @param {Object} matrix - Matrix configuration
   * @param {boolean} [failFast=true] - Fail fast on errors
   * @returns {WorkflowBuilder}
   */
  setMatrix(matrix, failFast = true) {
    return this.setStrategy({
      matrix,
      'fail-fast': failFast,
    });
  }

  /**
   * Add a step using an action
   * @param {string} name - Step name
   * @param {string} uses - Action to use (e.g., 'actions/checkout@v4')
   * @param {Object} [withParams] - Action inputs
   * @returns {WorkflowBuilder}
   */
  addStep(name, uses, withParams) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');

    const step = { name, uses };
    if (withParams) {
      step.with = withParams;
    }

    this.currentJob.steps.push(step);
    return this;
  }

  /**
   * Add a step that runs a command
   * @param {string} name - Step name
   * @param {string} run - Command to run
   * @param {Object} [options] - Additional options (env, working-directory, etc.)
   * @returns {WorkflowBuilder}
   */
  addRunStep(name, run, options = {}) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');

    const step = { name, run, ...options };
    this.currentJob.steps.push(step);
    return this;
  }

  /**
   * Add an inline step (custom configuration)
   * @param {Object} step - Complete step configuration
   * @returns {WorkflowBuilder}
   */
  addInlineStep(step) {
    if (!this.currentJob) throw new Error('No current job. Call addJob first.');
    this.currentJob.steps.push(step);
    return this;
  }

  /**
   * Add checkout step (common pattern)
   * @returns {WorkflowBuilder}
   */
  addCheckout() {
    return this.addStep('Checkout', 'actions/checkout@v4');
  }

  /**
   * Add Node.js setup step (common pattern)
   * @param {string|number} version - Node version
   * @param {string} [cache] - Package manager for caching (npm, yarn, pnpm)
   * @returns {WorkflowBuilder}
   */
  addSetupNode(version, cache) {
    const params = { 'node-version': String(version) };
    if (cache) {
      params.cache = cache;
    }
    return this.addStep(`Setup Node.js ${version}`, 'actions/setup-node@v4', params);
  }

  /**
   * Add npm install step (common pattern)
   * @param {boolean} [ci=true] - Use npm ci instead of npm install
   * @returns {WorkflowBuilder}
   */
  addNpmInstall(ci = true) {
    return this.addRunStep('Install dependencies', ci ? 'npm ci' : 'npm install');
  }

  /**
   * Add npm test step (common pattern)
   * @returns {WorkflowBuilder}
   */
  addNpmTest() {
    return this.addRunStep('Run tests', 'npm test');
  }

  /**
   * Add npm lint step (common pattern)
   * @returns {WorkflowBuilder}
   */
  addNpmLint() {
    return this.addRunStep('Lint', 'npm run lint');
  }

  /**
   * Add npm build step (common pattern)
   * @returns {WorkflowBuilder}
   */
  addNpmBuild() {
    return this.addRunStep('Build', 'npm run build');
  }

  /**
   * Switch to a different job (for adding steps)
   * @param {string} name - Job name
   * @returns {WorkflowBuilder}
   */
  switchToJob(name) {
    if (!this.workflow.jobs[name]) {
      throw new Error(`Job "${name}" does not exist`);
    }
    this.currentJobName = name;
    this.currentJob = this.workflow.jobs[name];
    return this;
  }

  /**
   * Use a preset configuration
   * @param {string} preset - Preset name ('node-ci', 'node-release', 'organism')
   * @returns {WorkflowBuilder}
   */
  usePreset(preset) {
    switch (preset) {
      case 'node-ci':
        return this
          .setName('CI')
          .onPush(['main'])
          .onPullRequest(['main'])
          .setPermissions({ contents: 'read' })
          .addJob('test', 'ubuntu-latest')
            .addCheckout()
            .addSetupNode(20, 'npm')
            .addNpmInstall()
            .addNpmLint()
            .addNpmTest();

      case 'node-release':
        return this
          .setName('Release')
          .onPush(['main'])
          .setPermissions({ contents: 'write' })
          .addJob('release', 'ubuntu-latest')
            .setIf("github.event_name == 'push' && github.ref == 'refs/heads/main'")
            .addCheckout()
            .addSetupNode(20, 'npm')
            .addNpmInstall()
            .addNpmBuild()
            .addRunStep('Create Release', 'npm run release');

      case 'organism':
        return this
          .setName('Organism CI')
          .onPush(['main'])
          .onPullRequest(['main'])
          .setPermissions({ contents: 'write' })
          .addJob('lint-and-test', 'ubuntu-latest')
            .setJobName('Lint & Test')
            .setMatrix({ 'node-version': [18, 20, 22] }, false)
            .addCheckout()
            .addStep('Setup Node.js ${{ matrix.node-version }}', 'actions/setup-node@v4', {
              'node-version': '${{ matrix.node-version }}',
            })
            .addRunStep('Validate manifests', 'node scripts/lint-manifests.js')
            .addRunStep('Run tests', 'node --test test/**/*.test.js');

      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }

  /**
   * Validate the workflow configuration
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.workflow.name) {
      errors.push('Workflow name is required');
    }

    if (Object.keys(this.workflow.on).length === 0) {
      errors.push('At least one trigger is required');
    }

    if (Object.keys(this.workflow.jobs).length === 0) {
      errors.push('At least one job is required');
    }

    for (const [jobName, job] of Object.entries(this.workflow.jobs)) {
      if (!job['runs-on']) {
        errors.push(`Job "${jobName}" is missing runs-on`);
      }
      if (!job.steps || job.steps.length === 0) {
        errors.push(`Job "${jobName}" has no steps`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build the final workflow object
   * @returns {Object} - Complete workflow configuration
   */
  build() {
    const { valid, errors } = this.validate();
    if (!valid) {
      throw new Error(`Invalid workflow: ${errors.join(', ')}`);
    }

    return JSON.parse(JSON.stringify(this.workflow));
  }

  /**
   * Build and export as YAML string
   * @returns {string}
   */
  toYAML() {
    const workflow = this.build();
    return this._objectToYAML(workflow, 0);
  }

  /**
   * Convert object to YAML string (simple implementation)
   * @param {*} obj - Object to convert
   * @param {number} indent - Current indentation level
   * @returns {string}
   * @private
   */
  _objectToYAML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    const lines = [];

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) continue;

        // Check if array of primitives
        if (typeof value[0] !== 'object') {
          lines.push(`${spaces}${key}:`);
          for (const item of value) {
            lines.push(`${spaces}  - ${this._formatYAMLValue(item)}`);
          }
        } else {
          lines.push(`${spaces}${key}:`);
          for (const item of value) {
            const itemLines = this._objectToYAML(item, indent + 2).split('\n');
            if (itemLines.length > 0) {
              lines.push(`${spaces}  - ${itemLines[0].trim()}`);
              for (let i = 1; i < itemLines.length; i++) {
                if (itemLines[i].trim()) {
                  lines.push(`${spaces}    ${itemLines[i].trim()}`);
                }
              }
            }
          }
        }
      } else if (typeof value === 'object') {
        lines.push(`${spaces}${key}:`);
        lines.push(this._objectToYAML(value, indent + 1));
      } else {
        lines.push(`${spaces}${key}: ${this._formatYAMLValue(value)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a value for YAML output
   * @param {*} value - Value to format
   * @returns {string}
   * @private
   */
  _formatYAMLValue(value) {
    if (typeof value === 'string') {
      // Check if string needs quoting
      if (value.includes(':') || value.includes('#') || value.includes("'") ||
          value.includes('"') || value.includes('\n') || value.includes('${{') ||
          value.includes('\\') || value.match(/^[0-9]+$/) || value === 'true' || value === 'false') {
        if (value.includes("'")) {
          // Escape both backslashes and double quotes for proper YAML escaping
          return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        return `'${value}'`;
      }
      return value;
    }
    return String(value);
  }

  /**
   * Create a new builder from an existing workflow object
   * @param {Object} workflow - Existing workflow object
   * @returns {WorkflowBuilder}
   */
  static fromObject(workflow) {
    const builder = new WorkflowBuilder();
    builder.workflow = JSON.parse(JSON.stringify(workflow));
    return builder;
  }
}

module.exports = WorkflowBuilder;
