/**
 * Tests for Builder Pattern Classes
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Import builders
const ExtensionBuilder = require('../../builders/patterns/extension-builder');
const SDKBuilder = require('../../builders/patterns/sdk-builder');
const ConfigBuilder = require('../../builders/patterns/config-builder');
const WorkflowBuilder = require('../../builders/patterns/workflow-builder');

/* ═══════════════════════════════════════════════════════════════ */
/*  ExtensionBuilder Tests                                         */
/* ═══════════════════════════════════════════════════════════════ */

describe('ExtensionBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new ExtensionBuilder();
  });

  it('should create a basic extension manifest', () => {
    const manifest = builder
      .setName('Test Extension')
      .setVersion('1.0.0')
      .setDescription('A test extension')
      .setBackgroundScript('background.js')
      .build();

    assert.strictEqual(manifest.name, 'Test Extension');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.manifest_version, 3);
    assert.strictEqual(manifest.background.service_worker, 'background.js');
  });

  it('should add permissions', () => {
    const manifest = builder
      .setName('Test')
      .setVersion('1.0.0')
      .addPermission('storage')
      .addPermission('activeTab')
      .addPermissions(['alarms', 'tabs'])
      .setBackgroundScript('bg.js')
      .build();

    assert.deepStrictEqual(manifest.permissions, ['storage', 'activeTab', 'alarms', 'tabs']);
  });

  it('should add content scripts', () => {
    const manifest = builder
      .setName('Test')
      .setVersion('1.0.0')
      .addContentScript(['<all_urls>'], ['content.js'])
      .build();

    assert.strictEqual(manifest.content_scripts.length, 1);
    assert.deepStrictEqual(manifest.content_scripts[0].matches, ['<all_urls>']);
    assert.deepStrictEqual(manifest.content_scripts[0].js, ['content.js']);
  });

  it('should use presets', () => {
    const minimal = builder
      .setName('Minimal')
      .setVersion('1.0.0')
      .usePreset('minimal')
      .build();

    assert.ok(minimal.background.service_worker);
    assert.ok(minimal.icons);
    assert.strictEqual(minimal.minimum_chrome_version, '116');
  });

  it('should validate manifest', () => {
    const { valid, errors } = builder.validate();

    assert.strictEqual(valid, false);
    assert.ok(errors.includes('Extension name is required'));
  });

  it('should throw on invalid build', () => {
    assert.throws(() => builder.build(), /Invalid manifest/);
  });

  it('should create from existing manifest', () => {
    const existing = {
      manifest_version: 3,
      name: 'Existing',
      version: '2.0.0',
      permissions: ['storage'],
    };

    const newBuilder = ExtensionBuilder.fromManifest(existing);
    newBuilder.addPermission('tabs').setBackgroundScript('bg.js');
    const manifest = newBuilder.build();

    assert.strictEqual(manifest.name, 'Existing');
    assert.strictEqual(manifest.version, '2.0.0');
    assert.ok(manifest.permissions.includes('tabs'));
  });
});

/* ═══════════════════════════════════════════════════════════════ */
/*  SDKBuilder Tests                                               */
/* ═══════════════════════════════════════════════════════════════ */

describe('SDKBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new SDKBuilder();
  });

  it('should create a basic SDK package.json', () => {
    const pkg = builder
      .setName('@medina/test-sdk')
      .setVersion('1.0.0')
      .setDescription('Test SDK')
      .addExport('.', './src/index.js')
      .build();

    assert.strictEqual(pkg.name, '@medina/test-sdk');
    assert.strictEqual(pkg.version, '1.0.0');
    assert.strictEqual(pkg.type, 'module');
    assert.strictEqual(pkg.exports['.'], './src/index.js');
  });

  it('should add dependencies', () => {
    const pkg = builder
      .setName('@medina/test')
      .setVersion('1.0.0')
      .addExport('.', './src/index.js')
      .addDependency('lodash', '^4.17.21')
      .addDevDependency('jest', '^29.0.0')
      .build();

    assert.strictEqual(pkg.dependencies.lodash, '^4.17.21');
    assert.strictEqual(pkg.devDependencies.jest, '^29.0.0');
  });

  it('should add keywords', () => {
    const pkg = builder
      .setName('@medina/test')
      .setVersion('1.0.0')
      .addExport('.', './src/index.js')
      .addKeywords(['ai', 'organism', 'sdk'])
      .build();

    assert.deepStrictEqual(pkg.keywords, ['ai', 'organism', 'sdk']);
  });

  it('should use presets', () => {
    const pkg = builder
      .setName('@medina/organism-test')
      .setVersion('1.0.0')
      .usePreset('organism')
      .build();

    assert.ok(pkg.keywords.includes('organism'));
    assert.ok(pkg.keywords.includes('sovereign'));
    assert.strictEqual(pkg.engines.node, '>=18.0.0');
  });

  it('should validate configuration', () => {
    const { valid, errors } = builder.validate();

    assert.strictEqual(valid, false);
    assert.ok(errors.includes('SDK name is required'));
  });
});

/* ═══════════════════════════════════════════════════════════════ */
/*  ConfigBuilder Tests                                            */
/* ═══════════════════════════════════════════════════════════════ */

describe('ConfigBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new ConfigBuilder();
  });

  it('should set nested values with dot notation', () => {
    const config = builder
      .set('app.name', 'Test App')
      .set('app.server.port', 3000)
      .set('app.server.host', 'localhost')
      .build();

    assert.strictEqual(config.app.name, 'Test App');
    assert.strictEqual(config.app.server.port, 3000);
    assert.strictEqual(config.app.server.host, 'localhost');
  });

  it('should apply defaults', () => {
    const config = builder
      .setDefaults({ app: { debug: false, version: '1.0.0' } })
      .set('app.name', 'My App')
      .build();

    assert.strictEqual(config.app.name, 'My App');
    assert.strictEqual(config.app.debug, false);
    assert.strictEqual(config.app.version, '1.0.0');
  });

  it('should apply environment overrides', () => {
    const devConfig = builder
      .set('app.debug', false)
      .setEnv('development', 'app.debug', true)
      .setEnv('production', 'app.debug', false)
      .build('development');

    assert.strictEqual(devConfig.app.debug, true);

    const prodConfig = builder.build('production');
    assert.strictEqual(prodConfig.app.debug, false);
  });

  it('should merge configs', () => {
    const config = builder
      .set('a', 1)
      .merge({ b: 2, c: { d: 3 } })
      .build();

    assert.strictEqual(config.a, 1);
    assert.strictEqual(config.b, 2);
    assert.strictEqual(config.c.d, 3);
  });

  it('should enable/disable features', () => {
    const config = builder
      .enableFeature('darkMode')
      .enableFeature('analytics', false)
      .disableFeature('tracking')
      .build();

    assert.strictEqual(config.features.darkMode, true);
    assert.strictEqual(config.features.analytics, false);
    assert.strictEqual(config.features.tracking, false);
  });

  it('should use presets', () => {
    const config = builder.usePreset('organism').build();

    assert.strictEqual(config.organism.heartbeat, 873);
    assert.ok(config.organism.phi > 1.618);
  });

  it('should export to JSON', () => {
    builder.set('test', 'value');
    const json = builder.toJSON();

    assert.ok(json.includes('"test"'));
    assert.ok(json.includes('"value"'));
  });
});

/* ═══════════════════════════════════════════════════════════════ */
/*  WorkflowBuilder Tests                                          */
/* ═══════════════════════════════════════════════════════════════ */

describe('WorkflowBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new WorkflowBuilder();
  });

  it('should create a basic workflow', () => {
    const workflow = builder
      .setName('CI')
      .onPush(['main'])
      .addJob('test', 'ubuntu-latest')
        .addRunStep('Hello', 'echo "Hello"')
      .build();

    assert.strictEqual(workflow.name, 'CI');
    assert.deepStrictEqual(workflow.on.push.branches, ['main']);
    assert.strictEqual(workflow.jobs.test['runs-on'], 'ubuntu-latest');
    assert.strictEqual(workflow.jobs.test.steps[0].name, 'Hello');
  });

  it('should add multiple triggers', () => {
    const workflow = builder
      .setName('CI')
      .onPush(['main', 'develop'])
      .onPullRequest(['main'])
      .onWorkflowDispatch()
      .addJob('test', 'ubuntu-latest')
        .addRunStep('Test', 'npm test')
      .build();

    assert.ok(workflow.on.push);
    assert.ok(workflow.on.pull_request);
    assert.ok(workflow.on.workflow_dispatch);
  });

  it('should add action steps', () => {
    const workflow = builder
      .setName('CI')
      .onPush(['main'])
      .addJob('test', 'ubuntu-latest')
        .addStep('Checkout', 'actions/checkout@v4')
        .addStep('Setup Node', 'actions/setup-node@v4', { 'node-version': '20' })
      .build();

    assert.strictEqual(workflow.jobs.test.steps[0].uses, 'actions/checkout@v4');
    assert.strictEqual(workflow.jobs.test.steps[1].with['node-version'], '20');
  });

  it('should set job dependencies', () => {
    const workflow = builder
      .setName('CI')
      .onPush(['main'])
      .addJob('build', 'ubuntu-latest')
        .addRunStep('Build', 'npm run build')
      .addJob('deploy', 'ubuntu-latest')
        .setNeeds('build')
        .addRunStep('Deploy', 'npm run deploy')
      .build();

    assert.deepStrictEqual(workflow.jobs.deploy.needs, ['build']);
  });

  it('should set matrix strategy', () => {
    const workflow = builder
      .setName('CI')
      .onPush(['main'])
      .addJob('test', 'ubuntu-latest')
        .setMatrix({ 'node-version': [18, 20, 22] })
        .addRunStep('Test', 'npm test')
      .build();

    assert.deepStrictEqual(workflow.jobs.test.strategy.matrix['node-version'], [18, 20, 22]);
  });

  it('should use helper methods', () => {
    const workflow = builder
      .setName('CI')
      .onPush(['main'])
      .addJob('test', 'ubuntu-latest')
        .addCheckout()
        .addSetupNode(20, 'npm')
        .addNpmInstall()
        .addNpmLint()
        .addNpmTest()
      .build();

    assert.strictEqual(workflow.jobs.test.steps.length, 5);
    assert.strictEqual(workflow.jobs.test.steps[0].uses, 'actions/checkout@v4');
  });

  it('should use presets', () => {
    const workflow = builder.usePreset('node-ci').build();

    assert.strictEqual(workflow.name, 'CI');
    assert.ok(workflow.on.push);
    assert.ok(workflow.on.pull_request);
    assert.ok(workflow.jobs.test);
  });

  it('should validate workflow', () => {
    const { valid, errors } = builder.validate();

    assert.strictEqual(valid, false);
    assert.ok(errors.includes('Workflow name is required'));
  });

  it('should generate YAML', () => {
    builder
      .setName('Test')
      .onPush(['main'])
      .addJob('test', 'ubuntu-latest')
        .addRunStep('Hello', 'echo "Hello"');

    const yaml = builder.toYAML();

    assert.ok(yaml.includes('name: Test'));
    assert.ok(yaml.includes('runs-on: ubuntu-latest'));
    assert.ok(yaml.includes("echo \"Hello\"") || yaml.includes('echo "Hello"'));
  });
});
