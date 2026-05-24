#!/usr/bin/env node
/**
 * 🎯 COORDINATOR ENGINE — Inter-Agent Task Coordination
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Manages multi-agent coordination:
 *   1. Task marketplace
 *   2. Capability matching
 *   3. Deadlock detection
 *   4. Collaboration protocols
 *
 * Usage:
 *   node scripts/coordinator-engine.js --scan-tasks
 *   node scripts/coordinator-engine.js --match-all
 *   node scripts/coordinator-engine.js --detect-deadlock
 *   node scripts/coordinator-engine.js --marketplace-report
 *
 * id: atlas://script/coordinator-engine
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;

const REPO             = path.resolve(__dirname, '..');
const REGISTRY_DIR     = path.join(REPO, 'governance', 'organism', 'registry', 'entities');
const COORDINATION_DIR = path.join(REPO, 'dist', 'coordination');
const TASKS_FILE       = path.join(COORDINATION_DIR, 'tasks.json');
const MATCHES_FILE     = path.join(COORDINATION_DIR, 'matches.json');
const STATUS_FILE      = path.join(COORDINATION_DIR, 'status.json');

// ── Task Status ───────────────────────────────────────────────────────────────
const TASK_STATUS = {
  PENDING: 'pending',
  MATCHED: 'matched',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  DEADLOCKED: 'deadlocked',
};

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  scanTasks: process.argv.includes('--scan-tasks'),
  matchAll: process.argv.includes('--match-all'),
  detectDeadlock: process.argv.includes('--detect-deadlock'),
  resolveDeadlock: process.argv.includes('--resolve-deadlock'),
  updateStatus: process.argv.includes('--update-status'),
  marketplaceReport: process.argv.includes('--marketplace-report'),
  verbose: process.argv.includes('--verbose'),
  taskId: process.argv.find(a => a.startsWith('--task='))?.split('=')[1],
};

// ── Initialize Coordination Directory ─────────────────────────────────────────
function initCoordinationDir() {
  fs.mkdirSync(COORDINATION_DIR, { recursive: true });
  
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify({ tasks: [] }, null, 2));
  }
  if (!fs.existsSync(MATCHES_FILE)) {
    fs.writeFileSync(MATCHES_FILE, JSON.stringify({ matches: [] }, null, 2));
  }
  if (!fs.existsSync(STATUS_FILE)) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ 
      lastUpdate: null,
      activeAgents: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      deadlockedTasks: 0,
    }, null, 2));
  }
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

// ── Load Tasks ────────────────────────────────────────────────────────────────
function loadTasks() {
  initCoordinationDir();
  return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
}

// ── Save Tasks ────────────────────────────────────────────────────────────────
function saveTasks(data) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2));
}

// ── Load Matches ──────────────────────────────────────────────────────────────
function loadMatches() {
  initCoordinationDir();
  return JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf8'));
}

// ── Save Matches ──────────────────────────────────────────────────────────────
function saveMatches(data) {
  fs.writeFileSync(MATCHES_FILE, JSON.stringify(data, null, 2));
}

// ── Scan Tasks ────────────────────────────────────────────────────────────────
function scanTasks() {
  console.log('🎯 Scanning for pending tasks...\n');
  
  const data = loadTasks();
  const pending = data.tasks.filter(t => t.status === TASK_STATUS.PENDING);
  
  console.log(`  📋 Total tasks: ${data.tasks.length}`);
  console.log(`  ⏳ Pending: ${pending.length}`);
  console.log(`  🔄 In progress: ${data.tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length}`);
  console.log(`  ✅ Completed: ${data.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length}`);
  console.log(`  🔒 Deadlocked: ${data.tasks.filter(t => t.status === TASK_STATUS.DEADLOCKED).length}`);
  
  return pending;
}

// ── Match Task to Agent ───────────────────────────────────────────────────────
function matchTaskToAgent(task, agents) {
  const requiredCaps = task.requiredCapabilities || [];
  
  // Find agents with matching capabilities
  const candidates = agents.filter(agent => {
    const agentCaps = agent.capabilities || [];
    return requiredCaps.every(cap => agentCaps.includes(cap));
  });
  
  if (candidates.length === 0) return null;
  
  // Sort by fitness (prefer higher fitness)
  candidates.sort((a, b) => (b.fitness_score || 0.5) - (a.fitness_score || 0.5));
  
  // Return best match with phi-weighted score
  const bestMatch = candidates[0];
  const matchScore = calculateMatchScore(task, bestMatch);
  
  return {
    taskId: task.id,
    agentId: bestMatch.id,
    agentName: bestMatch.name,
    matchScore,
    timestamp: new Date().toISOString(),
  };
}

// ── Calculate Match Score ─────────────────────────────────────────────────────
function calculateMatchScore(task, agent) {
  const requiredCaps = task.requiredCapabilities || [];
  const agentCaps = agent.capabilities || [];
  
  // Base: capability coverage
  const coverage = requiredCaps.length > 0
    ? requiredCaps.filter(c => agentCaps.includes(c)).length / requiredCaps.length
    : 1;
  
  // Bonus: extra capabilities
  const extraCaps = agentCaps.filter(c => !requiredCaps.includes(c)).length;
  const extraBonus = Math.min(0.2, extraCaps * 0.02);
  
  // Bonus: fitness
  const fitnessBonus = (agent.fitness_score || 0.5) * 0.2;
  
  // Phi-weighted combination
  const score = (coverage + extraBonus * PHI + fitnessBonus) / (1 + PHI);
  
  return Math.round(score * 1000) / 1000;
}

// ── Match All Tasks ───────────────────────────────────────────────────────────
function matchAllTasks() {
  console.log('🎯 Matching tasks to agents...\n');
  
  const agents = loadRegistry();
  const taskData = loadTasks();
  const matchData = loadMatches();
  
  const pending = taskData.tasks.filter(t => t.status === TASK_STATUS.PENDING);
  let matched = 0;
  
  pending.forEach(task => {
    const match = matchTaskToAgent(task, agents);
    
    if (match) {
      task.status = TASK_STATUS.MATCHED;
      task.assignedTo = match.agentId;
      matchData.matches.push(match);
      matched++;
      
      console.log(`  ✅ ${task.id} → ${match.agentName} (score: ${match.matchScore})`);
    } else {
      console.log(`  ⚠️ ${task.id} — no matching agent found`);
    }
  });
  
  saveTasks(taskData);
  saveMatches(matchData);
  
  console.log(`\n  📊 Matched ${matched}/${pending.length} tasks`);
}

// ── Detect Deadlock ───────────────────────────────────────────────────────────
function detectDeadlock() {
  const taskData = loadTasks();
  const inProgress = taskData.tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS);
  
  // Simple deadlock detection: tasks stuck for too long
  const TIMEOUT_MS = 3600000;  // 1 hour
  const now = Date.now();
  
  const deadlocked = inProgress.filter(task => {
    const startTime = new Date(task.startedAt || 0).getTime();
    return (now - startTime) > TIMEOUT_MS;
  });
  
  if (deadlocked.length > 0) {
    deadlocked.forEach(task => {
      task.status = TASK_STATUS.DEADLOCKED;
    });
    saveTasks(taskData);
  }
  
  const hasDeadlock = deadlocked.length > 0;
  
  if (args.verbose) {
    console.log(`🎯 Deadlock detection: ${hasDeadlock ? 'DETECTED' : 'None'}`);
    if (hasDeadlock) {
      deadlocked.forEach(t => console.log(`  🔒 ${t.id}`));
    }
  }
  
  // Output for GitHub Actions
  console.log(hasDeadlock ? 'true' : 'false');
  
  return hasDeadlock;
}

// ── Resolve Deadlock ──────────────────────────────────────────────────────────
function resolveDeadlock() {
  console.log('🎯 Resolving deadlocks...\n');
  
  const taskData = loadTasks();
  const deadlocked = taskData.tasks.filter(t => t.status === TASK_STATUS.DEADLOCKED);
  
  deadlocked.forEach(task => {
    // Reset to pending for re-matching
    task.status = TASK_STATUS.PENDING;
    task.assignedTo = null;
    task.deadlockResolved = new Date().toISOString();
    task.retryCount = (task.retryCount || 0) + 1;
    
    console.log(`  🔓 ${task.id} reset to pending (retry ${task.retryCount})`);
  });
  
  saveTasks(taskData);
  
  console.log(`\n  ✅ Resolved ${deadlocked.length} deadlocked tasks`);
}

// ── Update Status ─────────────────────────────────────────────────────────────
function updateStatus() {
  console.log('🎯 Updating coordination status...\n');
  
  const agents = loadRegistry();
  const taskData = loadTasks();
  
  const status = {
    lastUpdate: new Date().toISOString(),
    activeAgents: agents.filter(a => !a.sunset).length,
    totalTasks: taskData.tasks.length,
    pendingTasks: taskData.tasks.filter(t => t.status === TASK_STATUS.PENDING).length,
    matchedTasks: taskData.tasks.filter(t => t.status === TASK_STATUS.MATCHED).length,
    inProgressTasks: taskData.tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length,
    completedTasks: taskData.tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
    deadlockedTasks: taskData.tasks.filter(t => t.status === TASK_STATUS.DEADLOCKED).length,
  };
  
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  
  console.log('  📊 Status:');
  Object.entries(status).forEach(([k, v]) => {
    console.log(`     ${k}: ${v}`);
  });
}

// ── Marketplace Report ────────────────────────────────────────────────────────
function generateMarketplaceReport() {
  console.log('🎯 Task Marketplace Report\n');
  console.log('═'.repeat(50));
  
  const agents = loadRegistry();
  const taskData = loadTasks();
  const matchData = loadMatches();
  
  // Capability supply
  const capabilitySupply = {};
  agents.forEach(agent => {
    (agent.capabilities || []).forEach(cap => {
      capabilitySupply[cap] = (capabilitySupply[cap] || 0) + 1;
    });
  });
  
  // Capability demand
  const capabilityDemand = {};
  taskData.tasks.forEach(task => {
    (task.requiredCapabilities || []).forEach(cap => {
      capabilityDemand[cap] = (capabilityDemand[cap] || 0) + 1;
    });
  });
  
  console.log('\n  📦 Capability Supply (agents)');
  console.log('  ─────────────────────────────────────────');
  Object.entries(capabilitySupply)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cap, count]) => {
      console.log(`    ${cap}: ${count} agents`);
    });
  
  console.log('\n  📋 Capability Demand (tasks)');
  console.log('  ─────────────────────────────────────────');
  Object.entries(capabilityDemand)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cap, count]) => {
      console.log(`    ${cap}: ${count} tasks`);
    });
  
  console.log('\n  📊 Match Statistics');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Total matches: ${matchData.matches.length}`);
  
  const avgScore = matchData.matches.length > 0
    ? matchData.matches.reduce((sum, m) => sum + m.matchScore, 0) / matchData.matches.length
    : 0;
  console.log(`    Average match score: ${avgScore.toFixed(3)}`);
  
  console.log('\n═'.repeat(50));
}

// ── Main ──────────────────────────────────────────────────────────────────────
initCoordinationDir();

if (args.scanTasks) {
  scanTasks();
} else if (args.matchAll) {
  matchAllTasks();
} else if (args.detectDeadlock) {
  detectDeadlock();
} else if (args.resolveDeadlock) {
  resolveDeadlock();
} else if (args.updateStatus) {
  updateStatus();
} else if (args.marketplaceReport) {
  generateMarketplaceReport();
} else {
  console.log(`
🎯 Coordinator Engine — Inter-Agent Task Coordination

Usage:
  --scan-tasks           List pending tasks
  --match-all            Match all pending tasks to agents
  --detect-deadlock      Check for deadlocked tasks
  --resolve-deadlock     Reset deadlocked tasks
  --update-status        Update coordination status
  --marketplace-report   Generate capability marketplace report
  --verbose              Verbose output

Example:
  node coordinator-engine.js --scan-tasks
  node coordinator-engine.js --match-all
`);
}

module.exports = {
  loadTasks,
  saveTasks,
  matchTaskToAgent,
  calculateMatchScore,
  detectDeadlock,
  TASK_STATUS,
};
