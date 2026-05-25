#!/usr/bin/env node

/**
 * create-workflow — CLI Scaffolding for GitHub Actions Workflows
 *
 * Generates GitHub Actions workflow YAML files:
 * - CI workflows (lint, test, build)
 * - Release workflows
 * - Bot/automation workflows
 * - Custom workflows
 *
 * Usage:
 *   node builders/cli/create-workflow.js ci
 *   node builders/cli/create-workflow.js my-bot --preset organism
 *
 * Options:
 *   --preset <name>   Use preset: node-ci, node-release, organism (default: node-ci)
 *   --name <name>     Workflow display name
 */

'use strict';

const fs = require('fs');
const path = require('path');
const WorkflowBuilder = require('../patterns/workflow-builder');

/* ─── Colors ────────────────────────────────────────────────── */
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

/* ─── Argument Parser ───────────────────────────────────────── */
function parseArgs(args) {
  const result = {
    filename: null,
    preset: 'node-ci',
    name: null,
    trigger: 'push',
    branch: 'main',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--preset' && args[i + 1]) {
      result.preset = args[++i];
    } else if (arg === '--name' && args[i + 1]) {
      result.name = args[++i];
    } else if (arg === '--trigger' && args[i + 1]) {
      result.trigger = args[++i];
    } else if (arg === '--branch' && args[i + 1]) {
      result.branch = args[++i];
    } else if (!arg.startsWith('-') && !result.filename) {
      result.filename = arg;
    }
  }

  return result;
}

/* ─── Slug to Title ─────────────────────────────────────────── */
function toTitle(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/* ─── Create Workflow ───────────────────────────────────────── */
function createWorkflow(options) {
  const { filename, preset, name, trigger, branch } = options;

  if (!filename) {
    console.log(`${c.red}Error: Workflow filename is required${c.reset}`);
    console.log(`${c.dim}Usage: node builders/cli/create-workflow.js <filename> [options]${c.reset}`);
    process.exit(1);
  }

  // Ensure .yml extension
  const workflowFilename = filename.endsWith('.yml') ? filename : `${filename}.yml`;
  const workflowName = name || toTitle(filename.replace('.yml', ''));

  // Find workflows directory
  const repoRoot = process.cwd();
  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  const workflowPath = path.join(workflowsDir, workflowFilename);

  // Check if already exists
  if (fs.existsSync(workflowPath)) {
    console.log(`${c.yellow}Warning: Workflow "${workflowFilename}" already exists${c.reset}`);
    console.log(`${c.dim}Overwriting: ${workflowPath}${c.reset}`);
  }

  console.log('');
  console.log(`${c.bold}${c.cyan}  🏗  Creating Workflow: ${workflowName}${c.reset}`);
  console.log('');

  // Build workflow based on preset or custom
  let builder;

  switch (preset) {
    case 'node-ci':
      builder = new WorkflowBuilder().usePreset('node-ci');
      builder.workflow.name = workflowName;
      break;

    case 'node-release':
      builder = new WorkflowBuilder().usePreset('node-release');
      builder.workflow.name = workflowName;
      break;

    case 'organism':
      builder = new WorkflowBuilder().usePreset('organism');
      builder.workflow.name = workflowName;
      break;

    case 'bot':
      builder = new WorkflowBuilder()
        .setName(workflowName)
        .onSchedule('0 */6 * * *') // Every 6 hours
        .onWorkflowDispatch()
        .setPermissions({ contents: 'write', 'pull-requests': 'write' })
        .addJob('run', 'ubuntu-latest')
          .setJobName('Run Bot')
          .addCheckout()
          .addSetupNode(20, 'npm')
          .addNpmInstall()
          .addRunStep('Run Bot Script', `node scripts/${filename.replace('.yml', '')}.js`);
      break;

    case 'deploy':
      builder = new WorkflowBuilder()
        .setName(workflowName)
        .onPush([branch])
        .setPermissions({ contents: 'read', pages: 'write', 'id-token': 'write' })
        .setConcurrency('pages', true)
        .addJob('build', 'ubuntu-latest')
          .setJobName('Build')
          .addCheckout()
          .addSetupNode(20, 'npm')
          .addNpmInstall()
          .addNpmBuild()
          .addStep('Upload artifact', 'actions/upload-pages-artifact@v3', {
            path: './dist',
          })
        .addJob('deploy', 'ubuntu-latest')
          .setJobName('Deploy')
          .setNeeds('build')
          .setEnvironment('github-pages')
          .addStep('Deploy to GitHub Pages', 'actions/deploy-pages@v4');
      break;

    case 'custom':
    default:
      // Create a minimal custom workflow
      builder = new WorkflowBuilder()
        .setName(workflowName);

      // Add triggers based on options
      if (trigger === 'push') {
        builder.onPush([branch]);
      } else if (trigger === 'pull_request') {
        builder.onPullRequest([branch]);
      } else if (trigger === 'schedule') {
        builder.onSchedule('0 0 * * *'); // Daily at midnight
      } else if (trigger === 'dispatch') {
        builder.onWorkflowDispatch();
      } else {
        builder.onPush([branch]).onPullRequest([branch]);
      }

      builder
        .setPermissions({ contents: 'read' })
        .addJob('main', 'ubuntu-latest')
          .setJobName('Main Job')
          .addCheckout()
          .addRunStep('Hello', 'echo "Hello from ${workflowName}!"');
      break;
  }

  // Generate YAML
  const yaml = builder.toYAML();

  // Ensure directory exists
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }

  // Write workflow file
  console.log(`  ${c.green}✓${c.reset} ${workflowFilename}`);
  fs.writeFileSync(workflowPath, yaml);

  console.log('');
  console.log(`${c.bold}${c.green}  ✓ Workflow created successfully!${c.reset}`);
  console.log('');
  console.log(`  ${c.dim}Location:${c.reset} ${workflowPath}`);
  console.log(`  ${c.dim}Preset:${c.reset}   ${preset}`);
  console.log('');
  console.log(`  ${c.dim}The workflow will trigger on:${c.reset}`);

  const triggers = Object.keys(builder.workflow.on);
  for (const t of triggers) {
    const config = builder.workflow.on[t];
    if (t === 'push' || t === 'pull_request') {
      console.log(`    • ${t}: ${config.branches?.join(', ') || 'all branches'}`);
    } else if (t === 'schedule') {
      console.log(`    • ${t}: ${config.map(s => s.cron).join(', ')}`);
    } else {
      console.log(`    • ${t}`);
    }
  }
  console.log('');

  return workflowPath;
}

/* ─── CLI Entry Point ───────────────────────────────────────── */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('');
    console.log(`${c.bold}${c.cyan}  create-workflow — Scaffold a GitHub Actions workflow${c.reset}`);
    console.log('');
    console.log(`  ${c.bold}Usage:${c.reset}`);
    console.log(`    node builders/cli/create-workflow.js <filename> [options]`);
    console.log('');
    console.log(`  ${c.bold}Options:${c.reset}`);
    console.log(`    --preset <name>   Preset: node-ci, node-release, organism, bot, deploy, custom`);
    console.log(`    --name <name>     Workflow display name`);
    console.log(`    --trigger <type>  Trigger: push, pull_request, schedule, dispatch (for custom)`);
    console.log(`    --branch <name>   Branch name (default: main)`);
    console.log(`    --help, -h        Show this help`);
    console.log('');
    console.log(`  ${c.bold}Presets:${c.reset}`);
    console.log(`    node-ci       Standard Node.js CI (lint, test)`);
    console.log(`    node-release  Release workflow (build, release)`);
    console.log(`    organism      Organism-style matrix CI`);
    console.log(`    bot           Scheduled bot workflow`);
    console.log(`    deploy        GitHub Pages deployment`);
    console.log(`    custom        Minimal custom workflow`);
    console.log('');
    console.log(`  ${c.bold}Examples:${c.reset}`);
    console.log(`    node builders/cli/create-workflow.js ci`);
    console.log(`    node builders/cli/create-workflow.js release --preset node-release`);
    console.log(`    node builders/cli/create-workflow.js my-bot --preset bot`);
    console.log(`    node builders/cli/create-workflow.js deploy-pages --preset deploy`);
    console.log('');
    process.exit(0);
  }

  const options = parseArgs(args);
  createWorkflow(options);
}

module.exports = createWorkflow;
