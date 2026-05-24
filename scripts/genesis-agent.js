#!/usr/bin/env node
/**
 * 🧬 GENESIS AGENT — Agent Self-Replication System
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Creates and manages new agent definitions:
 *   1. Spawn new agents from blueprints
 *   2. Register agents in Atlas registry
 *   3. Generate workflow files
 *   4. Track agent lineage
 *
 * Usage:
 *   node scripts/genesis-agent.js --spawn --name=organism-new-bot --blueprint=observer
 *   node scripts/genesis-agent.js --register --name=organism-existing-bot
 *   node scripts/genesis-agent.js --census
 *   node scripts/genesis-agent.js --lineage-report
 *
 * id: atlas://script/genesis-agent
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;

const REPO           = path.resolve(__dirname, '..');
const REGISTRY_DIR   = path.join(REPO, 'governance', 'organism', 'registry', 'entities');
const BLUEPRINTS_DIR = path.join(REPO, 'sdk', 'agents', 'blueprints');
const WORKFLOWS_DIR  = path.join(REPO, '.github', 'workflows');
const SCRIPTS_DIR    = path.join(REPO, 'scripts');
const DIVERGENCE_DIR = path.join(REPO, 'governance', 'divergence');
const LINEAGE_FILE   = path.join(DIVERGENCE_DIR, 'lineage.json');

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  spawn: process.argv.includes('--spawn'),
  register: process.argv.includes('--register'),
  census: process.argv.includes('--census'),
  lineageReport: process.argv.includes('--lineage-report'),
  generateWorkflow: process.argv.includes('--generate-workflow'),
  updateLineage: process.argv.includes('--update-lineage'),
  name: process.argv.find(a => a.startsWith('--name='))?.split('=')[1],
  blueprint: process.argv.find(a => a.startsWith('--blueprint='))?.split('=')[1] || 'observer',
  capabilities: process.argv.find(a => a.startsWith('--capabilities='))?.split('=')[1]?.split(',') || [],
  domain: process.argv.find(a => a.startsWith('--domain='))?.split('=')[1],
  emoji: process.argv.find(a => a.startsWith('--emoji='))?.split('=')[1] || '🤖',
  parent: process.argv.find(a => a.startsWith('--parent='))?.split('=')[1],
};

// ── Load Blueprint ────────────────────────────────────────────────────────────
function loadBlueprint(blueprintName) {
  const blueprintFile = path.join(BLUEPRINTS_DIR, `${blueprintName}-blueprint.json`);
  
  if (!fs.existsSync(blueprintFile)) {
    console.error(`❌ Blueprint not found: ${blueprintName}`);
    return null;
  }
  
  return JSON.parse(fs.readFileSync(blueprintFile, 'utf8'));
}

// ── Load Registry ─────────────────────────────────────────────────────────────
function loadRegistry() {
  const agents = [];
  
  if (!fs.existsSync(REGISTRY_DIR)) {
    fs.mkdirSync(REGISTRY_DIR, { recursive: true });
    return agents;
  }
  
  fs.readdirSync(REGISTRY_DIR)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, f), 'utf8'));
        agents.push(data);
      } catch (e) {
        // Skip invalid files
      }
    });
  
  return agents;
}

// ── Spawn New Agent ───────────────────────────────────────────────────────────
function spawnAgent(name, blueprintName, additionalCaps, domain, emoji) {
  console.log(`🧬 Spawning new agent: ${name}\n`);
  
  // Load blueprint
  const blueprint = loadBlueprint(blueprintName);
  if (!blueprint) {
    process.exit(1);
  }
  
  console.log(`  📋 Using blueprint: ${blueprint.name}`);
  
  // Extract domain from name
  const domainFromName = name.replace('organism-', '').replace('-bot', '');
  
  // Calculate generation
  const registry = loadRegistry();
  const maxGeneration = Math.max(0, ...registry.map(a => a.generation || 0));
  
  // Merge capabilities
  const capabilities = [
    ...blueprint.baseCapabilities,
    ...additionalCaps.filter(c => !blueprint.restrictedCapabilities?.includes(c)),
  ];
  
  // Create agent definition
  const agent = {
    id: `atlas://bot/${name}`,
    name,
    class: blueprint.class,
    division: blueprint.defaultDivision,
    divisionNum: getDivisionNum(blueprint.defaultDivision),
    emoji: emoji,
    domain: domain || `${domainFromName.charAt(0).toUpperCase() + domainFromName.slice(1)} Agent`,
    triggers: blueprint.defaultTriggers,
    capabilities,
    authority: blueprint.authority,
    governance_pipeline: 'pipeline://governance/bot_cycle',
    ocl_ref: 'atlas://organism/bot-fleet',
    script: `scripts/${name.replace('organism-', '').replace('-bot', '')}-agent.js`,
    workflow: `.github/workflows/${name}.yml`,
    report: `docs/${name}-report.md`,
    parent: `atlas://blueprint/${blueprintName}`,
    generation: maxGeneration + 1,
    fitness_score: blueprint.fitnessBaseline,
    created_at: new Date().toISOString(),
    created_by: 'atlas://bot/organism-genesis-bot',
    resourceQuota: blueprint.resourceQuota,
  };
  
  // Save to registry
  const agentFile = path.join(REGISTRY_DIR, `${name}.json`);
  fs.writeFileSync(agentFile, JSON.stringify(agent, null, 2));
  
  console.log(`  ✅ Agent registered: ${agentFile}`);
  console.log(`     ID: ${agent.id}`);
  console.log(`     Generation: ${agent.generation}`);
  console.log(`     Capabilities: ${capabilities.join(', ')}`);
  
  return agent;
}

// ── Generate Workflow ─────────────────────────────────────────────────────────
function generateWorkflow(name) {
  console.log(`🧬 Generating workflow for: ${name}\n`);
  
  // Load agent definition
  const agentFile = path.join(REGISTRY_DIR, `${name}.json`);
  if (!fs.existsSync(agentFile)) {
    console.error(`❌ Agent not found: ${name}`);
    process.exit(1);
  }
  
  const agent = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
  const domainName = name.replace('organism-', '').replace('-bot', '');
  
  // Generate workflow YAML
  const workflow = `# ============================================================================
# ${name} — Auto-generated by Genesis Bot
#
# Domain: ${agent.domain}
# Blueprint: ${agent.parent}
# Generation: ${agent.generation}
# Created: ${agent.created_at}
#
# Identity: ${name} <${name}@users.noreply.github.com>
# ============================================================================

name: "${agent.emoji} ${agent.domain}"

on:
  ${agent.triggers.map(t => formatTrigger(t)).join('\n  ')}
  workflow_dispatch:

permissions:
  contents: write
  issues: write

jobs:
  ${domainName}-cycle:
    name: "${agent.emoji} ${agent.domain} Cycle"
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: "Run ${domainName} agent"
        run: |
          node ${agent.script} --run 2>/dev/null || echo "Script not yet implemented"

      - name: "Generate report"
        run: |
          mkdir -p docs
          echo "# ${agent.domain} Report" > ${agent.report}
          echo "" >> ${agent.report}
          echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> ${agent.report}
          echo "" >> ${agent.report}
          echo "---" >> ${agent.report}
          echo "*Auto-generated by ${name}*" >> ${agent.report}

      - name: Commit report
        run: |
          git config user.name "${name}"
          git config user.email "${name}@users.noreply.github.com"
          git add ${agent.report} || true
          if git diff --cached --quiet; then
            echo "No changes to commit"
          else
            git commit -m "${agent.emoji} ${name}: automated report"
            git push
          fi
`;

  const workflowFile = path.join(WORKFLOWS_DIR, `${name}.yml`);
  fs.writeFileSync(workflowFile, workflow);
  
  console.log(`  ✅ Workflow generated: ${workflowFile}`);
  
  return workflowFile;
}

// ── Format Trigger ────────────────────────────────────────────────────────────
function formatTrigger(trigger) {
  if (trigger.startsWith('push:')) {
    const branch = trigger.replace('push:', '');
    return `push:\n    branches: [${branch}]`;
  }
  if (trigger.startsWith('schedule:')) {
    const interval = trigger.replace('schedule:', '');
    const cron = intervalToCron(interval);
    return `schedule:\n    - cron: '${cron}'`;
  }
  if (trigger === 'pull_request') {
    return 'pull_request:';
  }
  if (trigger === 'workflow_run') {
    return 'workflow_run:\n    types: [completed]';
  }
  return `${trigger}:`;
}

// ── Interval to Cron ──────────────────────────────────────────────────────────
function intervalToCron(interval) {
  const mapping = {
    'every-1h': '0 * * * *',
    'every-3h': '0 */3 * * *',
    'every-6h': '0 */6 * * *',
    'every-12h': '0 */12 * * *',
    'every-24h': '0 0 * * *',
    'daily': '0 0 * * *',
    'weekly': '0 0 * * 0',
  };
  return mapping[interval] || '0 */6 * * *';
}

// ── Get Division Number ───────────────────────────────────────────────────────
function getDivisionNum(division) {
  const match = division.match(/^([IVX]+)/);
  return match ? match[1] : 'I';
}

// ── Update Lineage ────────────────────────────────────────────────────────────
function updateLineage(name, parent) {
  console.log(`🧬 Updating lineage for: ${name}\n`);
  
  fs.mkdirSync(DIVERGENCE_DIR, { recursive: true });
  
  // Load or create lineage
  let lineage = { agents: {}, edges: [], updated: null };
  if (fs.existsSync(LINEAGE_FILE)) {
    try {
      lineage = JSON.parse(fs.readFileSync(LINEAGE_FILE, 'utf8'));
    } catch (e) {
      // Reset if corrupted
    }
  }
  
  // Add agent
  lineage.agents[name] = {
    id: `atlas://bot/${name}`,
    parent: parent,
    created_at: new Date().toISOString(),
  };
  
  // Add edge
  if (parent) {
    lineage.edges.push({
      from: parent,
      to: `atlas://bot/${name}`,
      type: 'spawned',
      timestamp: new Date().toISOString(),
    });
  }
  
  lineage.updated = new Date().toISOString();
  
  fs.writeFileSync(LINEAGE_FILE, JSON.stringify(lineage, null, 2));
  console.log(`  ✅ Lineage updated: ${LINEAGE_FILE}`);
}

// ── Census ────────────────────────────────────────────────────────────────────
function runCensus() {
  console.log('🧬 Agent Census\n');
  console.log('═'.repeat(60));
  
  const registry = loadRegistry();
  
  // Group by division
  const byDivision = {};
  registry.forEach(agent => {
    const div = agent.division || 'Unknown';
    if (!byDivision[div]) byDivision[div] = [];
    byDivision[div].push(agent);
  });
  
  console.log(`\n📊 Total Agents: ${registry.length}\n`);
  
  for (const [division, agents] of Object.entries(byDivision).sort()) {
    console.log(`\n${division}`);
    console.log('─'.repeat(40));
    agents.forEach(a => {
      console.log(`  ${a.emoji || '🤖'} ${a.name}`);
      console.log(`     Gen: ${a.generation || 0} | Fitness: ${a.fitness_score || 'N/A'}`);
    });
  }
  
  // Generation stats
  const generations = registry.map(a => a.generation || 0);
  const maxGen = Math.max(0, ...generations);
  
  console.log(`\n📈 Generation Stats`);
  console.log('─'.repeat(40));
  console.log(`  Max Generation: ${maxGen}`);
  
  for (let g = 0; g <= maxGen; g++) {
    const count = generations.filter(gen => gen === g).length;
    if (count > 0) {
      console.log(`  Gen ${g}: ${count} agent(s)`);
    }
  }
}

// ── Lineage Report ────────────────────────────────────────────────────────────
function generateLineageReport() {
  console.log('🧬 Generating Lineage Report\n');
  
  if (!fs.existsSync(LINEAGE_FILE)) {
    console.log('  ⚠️ No lineage data found');
    return;
  }
  
  const lineage = JSON.parse(fs.readFileSync(LINEAGE_FILE, 'utf8'));
  
  console.log(`📊 Agents in Lineage: ${Object.keys(lineage.agents || {}).length}`);
  console.log(`🔗 Spawn Events: ${(lineage.edges || []).length}`);
  console.log(`📅 Last Updated: ${lineage.updated || 'Unknown'}`);
  
  // Build tree
  console.log('\n📜 Lineage Tree\n');
  
  const byParent = {};
  for (const [name, data] of Object.entries(lineage.agents || {})) {
    const parent = data.parent || 'root';
    if (!byParent[parent]) byParent[parent] = [];
    byParent[parent].push(name);
  }
  
  function printTree(parent, indent = '') {
    const children = byParent[parent] || [];
    children.forEach((child, i) => {
      const isLast = i === children.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      console.log(`${indent}${prefix}${child}`);
      printTree(`atlas://bot/${child}`, indent + (isLast ? '    ' : '│   '));
    });
  }
  
  // Print from blueprints
  Object.keys(byParent)
    .filter(k => k.startsWith('atlas://blueprint/'))
    .forEach(bp => {
      console.log(`📋 ${bp.replace('atlas://blueprint/', '')}`);
      printTree(bp, '  ');
    });
  
  // Print from root
  if (byParent['root']) {
    console.log('📦 Root');
    printTree('root', '  ');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.spawn && args.name) {
  spawnAgent(args.name, args.blueprint, args.capabilities, args.domain, args.emoji);
} else if (args.generateWorkflow && args.name) {
  generateWorkflow(args.name);
} else if (args.updateLineage && args.name) {
  updateLineage(args.name, args.parent);
} else if (args.register && args.name) {
  // Just verify the agent exists
  const agentFile = path.join(REGISTRY_DIR, `${args.name}.json`);
  if (fs.existsSync(agentFile)) {
    console.log(`✅ Agent registered: ${args.name}`);
  } else {
    console.error(`❌ Agent not found: ${args.name}`);
  }
} else if (args.census) {
  runCensus();
} else if (args.lineageReport) {
  generateLineageReport();
} else {
  console.log(`
🧬 Genesis Agent — Agent Self-Replication System

Usage:
  --spawn                 Create new agent
    --name=<name>         Agent name (organism-domain-bot)
    --blueprint=<bp>      Blueprint (observer|executor|analyzer|coordinator|guardian)
    --capabilities=<list> Additional capabilities (comma-separated)
    --domain=<desc>       Domain description
    --emoji=<emoji>       Agent emoji

  --generate-workflow     Generate workflow file
    --name=<name>         Agent name

  --update-lineage        Update lineage tracking
    --name=<name>         Agent name
    --parent=<uri>        Parent atlas URI

  --register              Verify agent registration
    --name=<name>         Agent name

  --census                List all registered agents

  --lineage-report        Generate lineage report

Example:
  node genesis-agent.js --spawn --name=organism-new-bot --blueprint=observer --emoji=🆕
`);
}

module.exports = {
  loadBlueprint,
  loadRegistry,
  spawnAgent,
  generateWorkflow,
  updateLineage,
  runCensus,
};
