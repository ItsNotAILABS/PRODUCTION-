#!/usr/bin/env node
/**
 * 🧬 EVOLUTION ENGINE — Hebbian Learning & Fitness System
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Manages continuous evolution through:
 *   1. Fitness score calculation
 *   2. Hebbian weight updates
 *   3. Capability expansion/sunset
 *   4. Generational cycles
 *
 * Usage:
 *   node scripts/evolution-engine.js --evaluate-all
 *   node scripts/evolution-engine.js --hebbian-update
 *   node scripts/evolution-engine.js --identify-candidates
 *   node scripts/evolution-engine.js --report
 *
 * id: atlas://script/evolution-engine
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const LEARNING_RATE = 0.60;  // From OCL drives

const REPO           = path.resolve(__dirname, '..');
const REGISTRY_DIR   = path.join(REPO, 'governance', 'organism', 'registry', 'entities');
const DIVERGENCE_DIR = path.join(REPO, 'governance', 'divergence');
const FITNESS_FILE   = path.join(DIVERGENCE_DIR, 'fitness-history.jsonl');
const DOCS_DIR       = path.join(REPO, 'docs');

// ── Fitness Thresholds ────────────────────────────────────────────────────────
const FITNESS_THRESHOLDS = {
  EXCELLENT: 0.8,    // Candidate for capability expansion
  GOOD: 0.6,
  AVERAGE: 0.4,
  POOR: 0.2,         // Candidate for optimization
  CRITICAL: 0.2,     // Candidate for sunset
};

// ── Fitness Weights ───────────────────────────────────────────────────────────
const FITNESS_WEIGHTS = {
  completion_rate: 0.30,
  error_rate: -0.25,
  escalation_rate: -0.10,
  time_efficiency: 0.20,
  resource_efficiency: 0.15,
  capability_growth: 0.10,
};

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  evaluateAll: process.argv.includes('--evaluate-all'),
  hebbianUpdate: process.argv.includes('--hebbian-update'),
  identifyCandidates: process.argv.includes('--identify-candidates'),
  recordFitness: process.argv.includes('--record-fitness'),
  report: process.argv.includes('--report'),
  agentId: process.argv.find(a => a.startsWith('--agent='))?.split('=')[1],
};

// ── Load Registry ─────────────────────────────────────────────────────────────
function loadRegistry() {
  const agents = [];
  if (!fs.existsSync(REGISTRY_DIR)) return agents;
  
  fs.readdirSync(REGISTRY_DIR)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REGISTRY_DIR, f), 'utf8'));
        agents.push({ ...data, _file: f });
      } catch (e) {}
    });
  
  return agents;
}

// ── Save Agent ────────────────────────────────────────────────────────────────
function saveAgent(agent) {
  const file = agent._file || `${agent.name}.json`;
  const data = { ...agent };
  delete data._file;
  fs.writeFileSync(path.join(REGISTRY_DIR, file), JSON.stringify(data, null, 2));
}

// ── Calculate Fitness Score ───────────────────────────────────────────────────
function calculateFitness(agent) {
  // Simulated metrics (in real system, would come from workflow run history)
  const metrics = agent.metrics || {
    completion_rate: 0.8 + (Math.random() * 0.2),
    error_rate: Math.random() * 0.2,
    escalation_rate: Math.random() * 0.1,
    time_efficiency: 0.7 + (Math.random() * 0.3),
    resource_efficiency: 0.7 + (Math.random() * 0.3),
    capability_growth: (agent.capabilities?.length || 0) / 10,
  };
  
  let score = 0;
  for (const [metric, weight] of Object.entries(FITNESS_WEIGHTS)) {
    const value = metrics[metric] || 0;
    score += value * weight;
  }
  
  // Normalize to [0, 1]
  return Math.max(0, Math.min(1, score));
}

// ── Evaluate All Agents ───────────────────────────────────────────────────────
function evaluateAllAgents() {
  console.log('🧬 Evaluating fitness for all agents...\n');
  
  const agents = loadRegistry();
  const results = [];
  
  agents.forEach(agent => {
    const oldFitness = agent.fitness_score || 0.5;
    const newFitness = calculateFitness(agent);
    
    // Apply phi-weighted smoothing
    const smoothedFitness = (oldFitness + newFitness * PHI) / (1 + PHI);
    
    agent.fitness_score = Math.round(smoothedFitness * 1000) / 1000;
    agent.fitness_evaluated = new Date().toISOString();
    
    saveAgent(agent);
    
    results.push({
      name: agent.name,
      oldFitness,
      newFitness,
      smoothedFitness: agent.fitness_score,
      status: getFitnessStatus(agent.fitness_score),
    });
    
    const emoji = agent.emoji || '🤖';
    const statusIcon = getStatusIcon(agent.fitness_score);
    console.log(`  ${emoji} ${agent.name}: ${statusIcon} ${agent.fitness_score} (was ${oldFitness.toFixed(3)})`);
  });
  
  console.log(`\n  ✅ Evaluated ${results.length} agents`);
  
  return results;
}

// ── Get Fitness Status ────────────────────────────────────────────────────────
function getFitnessStatus(score) {
  if (score >= FITNESS_THRESHOLDS.EXCELLENT) return 'excellent';
  if (score >= FITNESS_THRESHOLDS.GOOD) return 'good';
  if (score >= FITNESS_THRESHOLDS.AVERAGE) return 'average';
  if (score >= FITNESS_THRESHOLDS.POOR) return 'poor';
  return 'critical';
}

function getStatusIcon(score) {
  if (score >= FITNESS_THRESHOLDS.EXCELLENT) return '🟢';
  if (score >= FITNESS_THRESHOLDS.GOOD) return '🟡';
  if (score >= FITNESS_THRESHOLDS.AVERAGE) return '🟠';
  return '🔴';
}

// ── Hebbian Weight Update ─────────────────────────────────────────────────────
function hebbianUpdate(currentWeight, success, coactivation = 1) {
  const delta = LEARNING_RATE * success * coactivation;
  const newWeight = currentWeight + (delta / PHI);
  return Math.max(0.01, Math.min(PHI, newWeight));  // Bounded [0.01, φ]
}

function applyHebbianUpdates() {
  console.log('🧬 Applying Hebbian weight updates...\n');
  
  const agents = loadRegistry();
  
  agents.forEach(agent => {
    const fitness = agent.fitness_score || 0.5;
    const success = fitness - 0.5;  // Center around 0.5
    
    // Update capability weights (simulated)
    if (!agent.capability_weights) {
      agent.capability_weights = {};
      (agent.capabilities || []).forEach(cap => {
        agent.capability_weights[cap] = 1.0;
      });
    }
    
    // Apply Hebbian updates to each capability
    for (const cap of Object.keys(agent.capability_weights)) {
      const oldWeight = agent.capability_weights[cap];
      const newWeight = hebbianUpdate(oldWeight, success);
      agent.capability_weights[cap] = Math.round(newWeight * 1000) / 1000;
    }
    
    saveAgent(agent);
    
    console.log(`  ${agent.emoji || '🤖'} ${agent.name}: weights updated`);
  });
  
  console.log('\n  ✅ Hebbian updates applied');
}

// ── Identify Candidates ───────────────────────────────────────────────────────
function identifyCandidates() {
  const agents = loadRegistry();
  
  const expansion = agents.filter(a => 
    (a.fitness_score || 0) >= FITNESS_THRESHOLDS.EXCELLENT
  );
  
  const sunset = agents.filter(a => 
    (a.fitness_score || 0) < FITNESS_THRESHOLDS.CRITICAL
  );
  
  const result = { expansion, sunset };
  
  console.log(JSON.stringify(result));
  
  return result;
}

// ── Record Fitness History ────────────────────────────────────────────────────
function recordFitnessHistory() {
  console.log('🧬 Recording fitness history...\n');
  
  fs.mkdirSync(DIVERGENCE_DIR, { recursive: true });
  
  const agents = loadRegistry();
  const timestamp = new Date().toISOString();
  
  agents.forEach(agent => {
    const entry = {
      timestamp,
      agent: agent.id || `atlas://bot/${agent.name}`,
      fitness_score: agent.fitness_score,
      generation: agent.generation || 0,
    };
    
    fs.appendFileSync(FITNESS_FILE, JSON.stringify(entry) + '\n');
  });
  
  console.log(`  ✅ Recorded fitness for ${agents.length} agents`);
}

// ── Generate Evolution Report ─────────────────────────────────────────────────
function generateReport() {
  console.log('🧬 Generating evolution report...\n');
  
  const agents = loadRegistry();
  
  // Sort by fitness
  const sorted = [...agents].sort((a, b) => 
    (b.fitness_score || 0) - (a.fitness_score || 0)
  );
  
  // Calculate stats
  const fitnessScores = agents.map(a => a.fitness_score || 0);
  const avgFitness = fitnessScores.reduce((a, b) => a + b, 0) / fitnessScores.length;
  const maxFitness = Math.max(...fitnessScores);
  const minFitness = Math.min(...fitnessScores);
  
  const excellent = agents.filter(a => getFitnessStatus(a.fitness_score || 0) === 'excellent').length;
  const good = agents.filter(a => getFitnessStatus(a.fitness_score || 0) === 'good').length;
  const average = agents.filter(a => getFitnessStatus(a.fitness_score || 0) === 'average').length;
  const poor = agents.filter(a => getFitnessStatus(a.fitness_score || 0) === 'poor').length;
  const critical = agents.filter(a => getFitnessStatus(a.fitness_score || 0) === 'critical').length;
  
  const report = `# Evolution Report

*Generated: ${new Date().toISOString()}*

## Fleet Fitness Overview

| Metric | Value |
|--------|-------|
| Total Agents | ${agents.length} |
| Average Fitness | ${avgFitness.toFixed(3)} |
| Max Fitness | ${maxFitness.toFixed(3)} |
| Min Fitness | ${minFitness.toFixed(3)} |

## Fitness Distribution

| Status | Count | Percentage |
|--------|-------|------------|
| 🟢 Excellent (≥0.8) | ${excellent} | ${Math.round(excellent/agents.length*100)}% |
| 🟡 Good (0.6-0.8) | ${good} | ${Math.round(good/agents.length*100)}% |
| 🟠 Average (0.4-0.6) | ${average} | ${Math.round(average/agents.length*100)}% |
| 🔴 Poor (<0.4) | ${poor + critical} | ${Math.round((poor+critical)/agents.length*100)}% |

## Top Performers

${sorted.slice(0, 5).map((a, i) => `${i + 1}. ${a.emoji || '🤖'} **${a.name}** — ${a.fitness_score?.toFixed(3) || 'N/A'}`).join('\n')}

## Candidates for Action

### Expansion Candidates (fitness ≥ 0.8)
${sorted.filter(a => (a.fitness_score || 0) >= 0.8).map(a => `- ${a.name}`).join('\n') || '_None_'}

### Sunset Candidates (fitness < 0.2)
${sorted.filter(a => (a.fitness_score || 0) < 0.2).map(a => `- ${a.name}`).join('\n') || '_None_'}

## Hebbian Learning Status

- Learning Rate: ${LEARNING_RATE}
- Phi Constant: ${PHI.toFixed(6)}
- Weight Bounds: [0.01, ${PHI.toFixed(3)}]

---

*Auto-generated by organism-evolution-bot*
`;

  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const reportFile = path.join(DOCS_DIR, 'evolution-report.md');
  fs.writeFileSync(reportFile, report);
  
  console.log(`  ✅ Report saved to: ${reportFile}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.evaluateAll) {
  evaluateAllAgents();
} else if (args.hebbianUpdate) {
  applyHebbianUpdates();
} else if (args.identifyCandidates) {
  identifyCandidates();
} else if (args.recordFitness) {
  recordFitnessHistory();
} else if (args.report) {
  generateReport();
} else {
  console.log(`
🧬 Evolution Engine — Hebbian Learning & Fitness System

Usage:
  --evaluate-all           Evaluate fitness for all agents
  --hebbian-update         Apply Hebbian weight updates
  --identify-candidates    Find expansion/sunset candidates (JSON output)
  --record-fitness         Record current fitness to history
  --report                 Generate evolution report

Example:
  node evolution-engine.js --evaluate-all
  node evolution-engine.js --hebbian-update
  node evolution-engine.js --report
`);
}

module.exports = {
  calculateFitness,
  evaluateAllAgents,
  hebbianUpdate,
  applyHebbianUpdates,
  identifyCandidates,
  generateReport,
  FITNESS_THRESHOLDS,
};
