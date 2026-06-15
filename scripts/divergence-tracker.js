#!/usr/bin/env node
/**
 * 📊 DIVERGENCE TRACKER — Evolutionary Metrics System
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tracks and reports on divergence metrics for the autonomous evolution experiment:
 *   1. Code divergence (agent vs human commits)
 *   2. Protocol drift (weight changes over time)
 *   3. Capability expansion (new/sunset capabilities)
 *   4. Governance evolution (law changes)
 *
 * Usage:
 *   node scripts/divergence-tracker.js --metrics
 *   node scripts/divergence-tracker.js --report
 *   node scripts/divergence-tracker.js --record --type=commit --agent=test-bot
 *   node scripts/divergence-tracker.js --visualize
 *
 * id: atlas://script/divergence-tracker
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;

const REPO           = path.resolve(__dirname, '..');
const DIVERGENCE_DIR = path.join(REPO, 'governance', 'divergence');
const METRICS_FILE   = path.join(DIVERGENCE_DIR, 'metrics.json');
const LINEAGE_FILE   = path.join(DIVERGENCE_DIR, 'lineage.json');
const MUTATIONS_FILE = path.join(DIVERGENCE_DIR, 'mutations.jsonl');
const FITNESS_FILE   = path.join(DIVERGENCE_DIR, 'fitness-history.jsonl');
const REGISTRY_DIR   = path.join(REPO, 'governance', 'organism', 'registry', 'entities');
const DOCS_DIR       = path.join(REPO, 'docs');

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  metrics: process.argv.includes('--metrics'),
  report: process.argv.includes('--report'),
  record: process.argv.includes('--record'),
  visualize: process.argv.includes('--visualize'),
  update: process.argv.includes('--update'),
  type: process.argv.find(a => a.startsWith('--type='))?.split('=')[1],
  agent: process.argv.find(a => a.startsWith('--agent='))?.split('=')[1],
  value: process.argv.find(a => a.startsWith('--value='))?.split('=')[1],
};

// ── Load Metrics ──────────────────────────────────────────────────────────────
function loadMetrics() {
  if (!fs.existsSync(METRICS_FILE)) {
    return {
      id: 'divergence://metrics/current',
      version: '1.0.0',
      initialized: new Date().toISOString(),
      lastUpdated: null,
    };
  }
  return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
}

// ── Save Metrics ──────────────────────────────────────────────────────────────
function saveMetrics(metrics) {
  metrics.lastUpdated = new Date().toISOString();
  fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
}

// ── Load Registry ─────────────────────────────────────────────────────────────
function loadRegistry() {
  const agents = [];
  if (!fs.existsSync(REGISTRY_DIR)) return agents;
  
  fs.readdirSync(REGISTRY_DIR)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        agents.push(JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, f), 'utf8')));
      } catch (e) {}
    });
  
  return agents;
}

// ── Calculate Code Divergence ─────────────────────────────────────────────────
function calculateCodeDivergence() {
  const divergence = {
    totalAgentCommits: 0,
    totalHumanCommits: 0,
    agentFilesCreated: 0,
    linesAddedByAgents: 0,
    linesRemovedByAgents: 0,
  };
  
  // Cross-platform git invocation: ignore stderr via stdio (not POSIX `2>/dev/null`,
  // which cmd.exe on Windows mis-parses as a redirect to a nonexistent path and
  // returns the literal `""` fallback — fabricating a commit count of 1).
  const gitOpts = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] };
  const countLines = (out) => out.trim().split('\n').filter(Boolean).length;

  try {
    // Get commits by organism bots (identity law OL-009: organism-{name}-bot)
    const log = execSync('git log --oneline --all --author="organism-"', gitOpts);
    divergence.totalAgentCommits = countLines(log);

    // Get total commits, derive human/non-bot as the remainder
    const totalLog = execSync('git log --oneline --all', gitOpts);
    const total = countLines(totalLog);
    divergence.totalHumanCommits = Math.max(0, total - divergence.totalAgentCommits);

  } catch (e) {
    // Git not available or not a repo — leave counts at zero
  }
  
  return divergence;
}

// ── Calculate Fleet Metrics ───────────────────────────────────────────────────
function calculateFleetMetrics() {
  const agents = loadRegistry();
  
  const generations = agents.map(a => a.generation || 0);
  const fitnessScores = agents.map(a => a.fitness_score).filter(f => typeof f === 'number');
  
  return {
    totalAgents: agents.length,
    activeAgents: agents.filter(a => !a.sunset).length,
    maxGeneration: Math.max(0, ...generations),
    averageFitness: fitnessScores.length > 0 
      ? Math.round((fitnessScores.reduce((a, b) => a + b, 0) / fitnessScores.length) * 1000) / 1000
      : 0,
    healthStatus: 'green',  // Would be calculated from governance engine
  };
}

// ── Calculate Capability Expansion ────────────────────────────────────────────
function calculateCapabilityExpansion() {
  const agents = loadRegistry();
  const allCaps = agents.flatMap(a => a.capabilities || []);
  
  // Count capability frequency
  const capCounts = {};
  allCaps.forEach(c => {
    capCounts[c] = (capCounts[c] || 0) + 1;
  });
  
  const sortedCaps = Object.entries(capCounts).sort((a, b) => b[1] - a[1]);
  
  return {
    totalCapabilities: new Set(allCaps).size,
    newCapabilitiesThisCycle: 0,  // Would track over time
    sunsetCapabilities: 0,
    mostCommonCapability: sortedCaps[0]?.[0] || null,
  };
}

// ── Calculate Phi Metrics ─────────────────────────────────────────────────────
function calculatePhiMetrics() {
  const agents = loadRegistry();
  const fitnessScores = agents.map(a => a.fitness_score).filter(f => typeof f === 'number');
  
  // Check how many fitness scores are near phi-based values
  const phiValues = [PHI_INV, 0.5, PHI_INV * 0.8, PHI_INV * 1.2];
  let alignedCount = 0;
  
  fitnessScores.forEach(f => {
    if (phiValues.some(pv => Math.abs(f - pv) < 0.1)) {
      alignedCount++;
    }
  });
  
  return {
    goldenRatioAlignment: fitnessScores.length > 0 
      ? Math.round((alignedCount / fitnessScores.length) * 1000) / 1000
      : 0,
    heartbeatStability: 1.0,  // Would be measured from heartbeat data
    resonanceScore: 0.618,    // Default to phi-inverse
  };
}

// ── Update All Metrics ────────────────────────────────────────────────────────
function updateMetrics() {
  console.log('📊 Updating divergence metrics...\n');
  
  const metrics = loadMetrics();
  
  metrics.codeDivergence = calculateCodeDivergence();
  metrics.fleetMetrics = calculateFleetMetrics();
  metrics.capabilityExpansion = calculateCapabilityExpansion();
  metrics.phiMetrics = calculatePhiMetrics();
  
  saveMetrics(metrics);
  
  console.log('  ✅ Metrics updated');
  return metrics;
}

// ── Display Metrics ───────────────────────────────────────────────────────────
function displayMetrics() {
  const metrics = updateMetrics();
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  📊 DIVERGENCE METRICS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('  📅 Experiment Started:', metrics.experiment?.started || 'Unknown');
  console.log('  📅 Last Updated:', metrics.lastUpdated || 'Never');
  console.log('  🔬 Status:', metrics.experiment?.status || 'Unknown');
  
  console.log('\n  💻 Code Divergence');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Agent Commits:  ${metrics.codeDivergence?.totalAgentCommits || 0}`);
  console.log(`    Human Commits:  ${metrics.codeDivergence?.totalHumanCommits || 0}`);
  
  console.log('\n  🤖 Fleet Metrics');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Total Agents:    ${metrics.fleetMetrics?.totalAgents || 0}`);
  console.log(`    Active Agents:   ${metrics.fleetMetrics?.activeAgents || 0}`);
  console.log(`    Max Generation:  ${metrics.fleetMetrics?.maxGeneration || 0}`);
  console.log(`    Avg Fitness:     ${metrics.fleetMetrics?.averageFitness || 0}`);
  console.log(`    Health:          ${metrics.fleetMetrics?.healthStatus || 'Unknown'}`);
  
  console.log('\n  🔧 Capability Expansion');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Unique Capabilities: ${metrics.capabilityExpansion?.totalCapabilities || 0}`);
  console.log(`    Most Common:         ${metrics.capabilityExpansion?.mostCommonCapability || 'None'}`);
  
  console.log('\n  φ Phi Metrics');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Golden Ratio Alignment: ${metrics.phiMetrics?.goldenRatioAlignment || 0}`);
  console.log(`    Heartbeat Stability:    ${metrics.phiMetrics?.heartbeatStability || 0}`);
  console.log(`    Resonance Score:        ${metrics.phiMetrics?.resonanceScore || 0}`);
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// ── Record Event ──────────────────────────────────────────────────────────────
function recordEvent(type, agent, value) {
  console.log(`📊 Recording ${type} event for ${agent}...\n`);
  
  fs.mkdirSync(DIVERGENCE_DIR, { recursive: true });
  
  const event = {
    type,
    agent: agent ? `atlas://bot/${agent}` : null,
    value,
    timestamp: new Date().toISOString(),
  };
  
  // Append to appropriate file
  let targetFile;
  switch (type) {
    case 'mutation':
    case 'capability':
      targetFile = MUTATIONS_FILE;
      break;
    case 'fitness':
      targetFile = FITNESS_FILE;
      break;
    default:
      targetFile = path.join(DIVERGENCE_DIR, 'events.jsonl');
  }
  
  fs.appendFileSync(targetFile, JSON.stringify(event) + '\n');
  console.log(`  ✅ Event recorded to ${targetFile}`);
}

// ── Generate Report ───────────────────────────────────────────────────────────
function generateReport() {
  console.log('📊 Generating divergence report...\n');
  
  const metrics = updateMetrics();
  const lineage = fs.existsSync(LINEAGE_FILE) 
    ? JSON.parse(fs.readFileSync(LINEAGE_FILE, 'utf8'))
    : { agents: {}, edges: [] };
  
  const report = `# Divergence Report

*Generated: ${new Date().toISOString()}*

## Experiment Status

| Metric | Value |
|--------|-------|
| Status | ${metrics.experiment?.status || 'Active'} |
| Started | ${metrics.experiment?.started || 'Unknown'} |
| Last Updated | ${metrics.lastUpdated || 'Never'} |

## Code Divergence

| Metric | Count |
|--------|-------|
| Agent Commits | ${metrics.codeDivergence?.totalAgentCommits || 0} |
| Human Commits | ${metrics.codeDivergence?.totalHumanCommits || 0} |
| Agent Ratio | ${calculateAgentRatio(metrics)}% |

## Fleet Status

| Metric | Value |
|--------|-------|
| Total Agents | ${metrics.fleetMetrics?.totalAgents || 0} |
| Active Agents | ${metrics.fleetMetrics?.activeAgents || 0} |
| Max Generation | ${metrics.fleetMetrics?.maxGeneration || 0} |
| Average Fitness | ${metrics.fleetMetrics?.averageFitness || 0} |
| Health Status | ${metrics.fleetMetrics?.healthStatus || 'Unknown'} |

## Capability Distribution

- Total Unique Capabilities: ${metrics.capabilityExpansion?.totalCapabilities || 0}
- Most Common: ${metrics.capabilityExpansion?.mostCommonCapability || 'None'}

## Phi Alignment

| Metric | Score |
|--------|-------|
| Golden Ratio Alignment | ${metrics.phiMetrics?.goldenRatioAlignment || 0} |
| Heartbeat Stability | ${metrics.phiMetrics?.heartbeatStability || 0} |
| Resonance Score | ${metrics.phiMetrics?.resonanceScore || 0} |

## Agent Lineage

Agents spawned: ${Object.keys(lineage.agents || {}).length}
Spawn events: ${(lineage.edges || []).length}

---

*Auto-generated by divergence-tracker*
`;

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const reportFile = path.join(DOCS_DIR, 'divergence-report.md');
  fs.writeFileSync(reportFile, report);
  
  console.log(`  ✅ Report saved to: ${reportFile}`);
}

function calculateAgentRatio(metrics) {
  const agent = metrics.codeDivergence?.totalAgentCommits || 0;
  const human = metrics.codeDivergence?.totalHumanCommits || 0;
  const total = agent + human;
  return total > 0 ? Math.round((agent / total) * 100) : 0;
}

// ── Visualize Lineage ─────────────────────────────────────────────────────────
function visualizeLineage() {
  console.log('📊 Lineage Visualization\n');
  
  if (!fs.existsSync(LINEAGE_FILE)) {
    console.log('  ⚠️ No lineage data found');
    return;
  }
  
  const lineage = JSON.parse(fs.readFileSync(LINEAGE_FILE, 'utf8'));
  const agents = Object.entries(lineage.agents || {});
  
  if (agents.length === 0) {
    console.log('  📭 No agents in lineage yet');
    return;
  }
  
  console.log('  🌳 Agent Family Tree\n');
  
  // Build parent-child map
  const children = {};
  agents.forEach(([name, data]) => {
    const parent = data.parent || 'root';
    if (!children[parent]) children[parent] = [];
    children[parent].push(name);
  });
  
  // Print tree
  function printBranch(node, prefix = '') {
    const kids = children[node] || [];
    kids.forEach((child, i) => {
      const isLast = i === kids.length - 1;
      console.log(`${prefix}${isLast ? '└── ' : '├── '}${child}`);
      printBranch(`atlas://bot/${child}`, prefix + (isLast ? '    ' : '│   '));
    });
  }
  
  // Start from blueprints and root
  const roots = Object.keys(children).filter(k => 
    k === 'root' || k.startsWith('atlas://blueprint/')
  );
  
  roots.forEach(root => {
    console.log(`  📦 ${root.replace('atlas://blueprint/', '').replace('root', 'Genesis')}`);
    printBranch(root, '     ');
    console.log('');
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.metrics) {
  displayMetrics();
} else if (args.report) {
  generateReport();
} else if (args.record && args.type) {
  recordEvent(args.type, args.agent, args.value);
} else if (args.visualize) {
  visualizeLineage();
} else if (args.update) {
  updateMetrics();
} else {
  console.log(`
📊 Divergence Tracker — Evolutionary Metrics System

Usage:
  --metrics           Display current divergence metrics
  --report            Generate markdown report
  --update            Update metrics from current state
  --visualize         Visualize agent lineage tree
  --record            Record an event
    --type=<type>     Event type (commit|mutation|fitness|capability)
    --agent=<name>    Agent name
    --value=<val>     Event value

Example:
  node divergence-tracker.js --metrics
  node divergence-tracker.js --report
  node divergence-tracker.js --record --type=fitness --agent=test-bot --value=0.75
`);
}

module.exports = {
  loadMetrics,
  saveMetrics,
  updateMetrics,
  calculateCodeDivergence,
  calculateFleetMetrics,
  generateReport,
};
