/**
 * Workflow Templates — Reusable GitHub Actions configurations
 *
 * Pre-built workflow configurations for common patterns.
 */

'use strict';

const WorkflowBuilder = require('../patterns/workflow-builder');

/**
 * Create a Node.js CI workflow with matrix testing
 * @param {Object} options - Configuration options
 * @returns {WorkflowBuilder}
 */
function createNodeCIWorkflow(options = {}) {
  const {
    name = 'CI',
    branches = ['main'],
    nodeVersions = [18, 20, 22],
    runLint = true,
    runBuild = false,
  } = options;

  const builder = new WorkflowBuilder()
    .setName(name)
    .onPush(branches)
    .onPullRequest(branches)
    .setPermissions({ contents: 'read' })
    .addJob('test', 'ubuntu-latest')
      .setJobName('Lint & Test')
      .setMatrix({ 'node-version': nodeVersions }, false)
      .addCheckout()
      .addStep('Setup Node.js ${{ matrix.node-version }}', 'actions/setup-node@v4', {
        'node-version': '${{ matrix.node-version }}',
        cache: 'npm',
      })
      .addNpmInstall();

  if (runLint) {
    builder.addNpmLint();
  }

  builder.addNpmTest();

  if (runBuild) {
    builder.addNpmBuild();
  }

  return builder;
}

/**
 * Create a release workflow
 * @param {Object} options - Configuration options
 * @returns {WorkflowBuilder}
 */
function createReleaseWorkflow(options = {}) {
  const {
    name = 'Release',
    branch = 'main',
    nodeVersion = 20,
    buildCommand = 'npm run build',
    releaseCommand = 'npm run release',
  } = options;

  return new WorkflowBuilder()
    .setName(name)
    .onPush([branch])
    .onWorkflowDispatch()
    .setPermissions({ contents: 'write' })
    .addJob('release', 'ubuntu-latest')
      .setJobName('Build & Release')
      .setIf("github.event_name == 'push' || github.event_name == 'workflow_dispatch'")
      .addCheckout()
      .addSetupNode(nodeVersion, 'npm')
      .addNpmInstall()
      .addRunStep('Build', buildCommand)
      .addRunStep('Release', releaseCommand);
}

/**
 * Create a scheduled bot workflow
 * @param {Object} options - Configuration options
 * @returns {WorkflowBuilder}
 */
function createBotWorkflow(options = {}) {
  const {
    name = 'Bot',
    schedule = '0 */6 * * *', // Every 6 hours
    script = 'scripts/bot.js',
    nodeVersion = 20,
  } = options;

  return new WorkflowBuilder()
    .setName(name)
    .onSchedule(schedule)
    .onWorkflowDispatch()
    .setPermissions({ contents: 'write', 'pull-requests': 'write', issues: 'write' })
    .addJob('run', 'ubuntu-latest')
      .setJobName(`Run ${name}`)
      .addCheckout()
      .addSetupNode(nodeVersion, 'npm')
      .addNpmInstall()
      .addRunStep('Run Bot', `node ${script}`, {
        env: {
          GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
        },
      });
}

/**
 * Create a GitHub Pages deployment workflow
 * @param {Object} options - Configuration options
 * @returns {WorkflowBuilder}
 */
function createPagesDeployWorkflow(options = {}) {
  const {
    name = 'Deploy to Pages',
    branch = 'main',
    buildDir = './dist',
    nodeVersion = 20,
  } = options;

  return new WorkflowBuilder()
    .setName(name)
    .onPush([branch])
    .onWorkflowDispatch()
    .setPermissions({ contents: 'read', pages: 'write', 'id-token': 'write' })
    .setConcurrency('pages', true)
    .addJob('build', 'ubuntu-latest')
      .setJobName('Build')
      .addCheckout()
      .addSetupNode(nodeVersion, 'npm')
      .addNpmInstall()
      .addNpmBuild()
      .addStep('Upload artifact', 'actions/upload-pages-artifact@v3', {
        path: buildDir,
      })
    .addJob('deploy', 'ubuntu-latest')
      .setJobName('Deploy')
      .setNeeds('build')
      .setEnvironment('github-pages')
      .addStep('Deploy to GitHub Pages', 'actions/deploy-pages@v4');
}

/**
 * Create a Docker build and push workflow
 * @param {Object} options - Configuration options
 * @returns {WorkflowBuilder}
 */
function createDockerWorkflow(options = {}) {
  const {
    name = 'Docker Build',
    branch = 'main',
    registry = 'ghcr.io',
    imageName = '${{ github.repository }}',
  } = options;

  return new WorkflowBuilder()
    .setName(name)
    .onPush([branch])
    .onPullRequest([branch])
    .setPermissions({ contents: 'read', packages: 'write' })
    .addJob('build', 'ubuntu-latest')
      .setJobName('Build and Push')
      .addCheckout()
      .addStep('Set up Docker Buildx', 'docker/setup-buildx-action@v3')
      .addStep('Login to Registry', 'docker/login-action@v3', {
        registry,
        username: '${{ github.actor }}',
        password: '${{ secrets.GITHUB_TOKEN }}',
      })
      .addStep('Build and push', 'docker/build-push-action@v5', {
        context: '.',
        push: "${{ github.event_name != 'pull_request' }}",
        tags: `${registry}/${imageName}:latest`,
        cache_from: 'type=gha',
        cache_to: 'type=gha,mode=max',
      });
}

/**
 * Create an Organism-style workflow with all bots
 * @param {Object} options - Configuration options
 * @returns {WorkflowBuilder}
 */
function createOrganismWorkflow(options = {}) {
  const {
    name = 'Organism CI',
    branches = ['main'],
  } = options;

  return new WorkflowBuilder()
    .setName(name)
    .onPush(branches)
    .onPullRequest(branches)
    .setPermissions({ contents: 'write' })
    .addJob('lint-and-test', 'ubuntu-latest')
      .setJobName('Lint & Test')
      .setMatrix({ 'node-version': [18, 20, 22] }, false)
      .addCheckout()
      .addStep('Setup Node.js ${{ matrix.node-version }}', 'actions/setup-node@v4', {
        'node-version': '${{ matrix.node-version }}',
      })
      .addRunStep('Validate manifests', 'node scripts/lint-manifests.js')
      .addRunStep('Run tests', 'node --test test/**/*.test.js')
    .addJob('build-extensions', 'ubuntu-latest')
      .setJobName('Build Extensions')
      .setNeeds('lint-and-test')
      .setIf("github.ref == 'refs/heads/main' && github.event_name == 'push'")
      .addCheckout()
      .addSetupNode(20)
      .addRunStep('Generate icons', 'node scripts/generate-icons.js')
      .addRunStep('Build extensions', 'bash build-extensions.sh')
      .addRunStep('Commit dist/', `
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add dist/
if git diff --cached --quiet; then
  echo "No changes to dist/"
else
  git commit -m "build: rebuild extension zips [skip ci]"
  git push
fi
`.trim());
}

module.exports = {
  createNodeCIWorkflow,
  createReleaseWorkflow,
  createBotWorkflow,
  createPagesDeployWorkflow,
  createDockerWorkflow,
  createOrganismWorkflow,
};
