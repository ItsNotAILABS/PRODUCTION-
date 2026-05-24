#!/usr/bin/env node
/**
 * 🔄 AUTO ORCHESTRATOR — Self-Sustaining Agent Runtime
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The AUTO (Autonomous Task Unification Organism) orchestrates all internal
 * AI agents in a continuous loop, creating a living, breathing system that
 * operates without constant human intervention.
 *
 * Key Capabilities:
 *   1. Heartbeat Loop (873ms phi-encoded rhythm)
 *   2. Agent Health Monitoring & Self-Healing
 *   3. Task Queue Processing
 *   4. Divergence Tracking Integration
 *   5. Continuous Evolution Cycles
 *
 * The divergence experiment: Let agents evolve the codebase autonomously
 * while tracking metrics to observe emergence patterns.
 *
 * Usage:
 *   node scripts/auto-orchestrator.js --start      # Start AUTO
 *   node scripts/auto-orchestrator.js --status     # Check status
 *   node scripts/auto-orchestrator.js --pulse      # Single heartbeat
 *   node scripts/auto-orchestrator.js --metrics    # Show metrics
 *   node scripts/auto-orchestrator.js --agents     # List active agents
 *
 * id: atlas://script/auto-orchestrator
 * class: T1-SOVEREIGN
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

// ── PHI Constants ─────────────────────────────────────────────────────────────
const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT_MS = 873; // φ × 873 ≈ 1412
const CYCLE_INTERVAL = HEARTBEAT_MS * PHI; // ~1412ms

// ── Paths ─────────────────────────────────────────────────────────────────────
const REPO           = path.resolve(__dirname, '..');
const STATE_FILE     = path.join(REPO, 'governance', 'auto', 'state.json');
const QUEUE_FILE     = path.join(REPO, 'governance', 'auto', 'task-queue.json');
const METRICS_FILE   = path.join(REPO, 'governance', 'divergence', 'metrics.json');
const LINEAGE_FILE   = path.join(REPO, 'governance', 'divergence', 'lineage.json');
const REGISTRY_DIR   = path.join(REPO, 'governance', 'organism', 'registry', 'entities');
const SCRIPTS_DIR    = path.join(REPO, 'scripts');

// ── Allowed Scripts (whitelist for security) ──────────────────────────────────
const ALLOWED_SCRIPTS = new Set([
  'genesis-agent.js',
  'divergence-tracker.js',
  'evolution-engine.js',
]);

/**
 * Safely execute a whitelisted script with arguments
 * @param {string} scriptName - The script filename (must be in ALLOWED_SCRIPTS)
 * @param {string[]} args - Arguments to pass to the script
 * @returns {string} - The script output
 */
function safeExecScript(scriptName, args = []) {
  if (!ALLOWED_SCRIPTS.has(scriptName)) {
    throw new Error(`Script not allowed: ${scriptName}`);
  }
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  return execFileSync('node', [scriptPath, ...args], { encoding: 'utf8' });
}
const AUTO_DIR       = path.join(REPO, 'governance', 'auto');

// ── Agent Types ───────────────────────────────────────────────────────────────
const AGENT_TYPES = {
  ANIMUS:    'mind',      // reasoning, decisions
  CORPUS:    'body',      // execution, action
  SENSUS:    'senses',    // perception, filtering
  MEMORIA:   'memory',    // encoding, retrieval
  GENESIS:   'spawn',     // agent creation
  EVOLUTION: 'evolve',    // fitness, adaptation
  SENTINEL:  'guard',     // security, safety
  GOVERNOR:  'govern',    // laws, voting
};

// ── Task Types ────────────────────────────────────────────────────────────────
const TASK_TYPES = {
  SPAWN:       'spawn',
  EVOLVE:      'evolve',
  HEAL:        'heal',
  OBSERVE:     'observe',
  EXECUTE:     'execute',
  COMMIT:      'commit',
  DIVERGE:     'diverge',
  SYNC:        'sync',
};

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  start:   process.argv.includes('--start'),
  stop:    process.argv.includes('--stop'),
  status:  process.argv.includes('--status'),
  pulse:   process.argv.includes('--pulse'),
  metrics: process.argv.includes('--metrics'),
  agents:  process.argv.includes('--agents'),
  init:    process.argv.includes('--init'),
  queue:   process.argv.includes('--queue'),
  add:     process.argv.find(a => a.startsWith('--add='))?.split('=')[1],
  daemon:  process.argv.includes('--daemon'),
};

// ── Initialize Directories ────────────────────────────────────────────────────
function initDirectories() {
  fs.mkdirSync(AUTO_DIR, { recursive: true });
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
}

// ── Load/Save State ───────────────────────────────────────────────────────────
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return createInitialState();
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return createInitialState();
  }
}

function saveState(state) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function createInitialState() {
  return {
    id: 'auto://state/current',
    version: '1.0.0',
    status: 'initialized',
    started: null,
    lastPulse: null,
    lastUpdated: null,
    pulseCount: 0,
    cycleCount: 0,
    health: {
      score: 1.0,
      status: 'green',
      lastCheck: null,
    },
    agents: {},
    taskQueue: [],
    metrics: {
      tasksProcessed: 0,
      tasksSuccess: 0,
      tasksFailed: 0,
      avgPulseTime: 0,
    },
  };
}

// ── Load/Save Task Queue ──────────────────────────────────────────────────────
function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { tasks: [], processed: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch (e) {
    return { tasks: [], processed: [] };
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

// ── Load Agent Registry ───────────────────────────────────────────────────────
function loadAgentRegistry() {
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

// ── Heartbeat/Pulse ───────────────────────────────────────────────────────────
function pulse(state) {
  const startTime = Date.now();
  
  state.pulseCount++;
  state.lastPulse = new Date().toISOString();
  
  // Check agent health
  const agents = loadAgentRegistry();
  state.agents = {};
  agents.forEach(a => {
    state.agents[a.name] = {
      id: a.id,
      status: 'active',
      fitness: a.fitness_score || PHI_INV,
      lastSeen: new Date().toISOString(),
    };
  });
  
  // Process task queue
  const queue = loadQueue();
  if (queue.tasks.length > 0) {
    const task = queue.tasks.shift();
    const result = processTask(task, state);
    
    task.processedAt = new Date().toISOString();
    task.result = result;
    queue.processed.push(task);
    
    // Keep only last 100 processed tasks
    if (queue.processed.length > 100) {
      queue.processed = queue.processed.slice(-100);
    }
    
    saveQueue(queue);
    
    state.metrics.tasksProcessed++;
    if (result.success) {
      state.metrics.tasksSuccess++;
    } else {
      state.metrics.tasksFailed++;
    }
  }
  
  // Update health score using phi-decay
  const pulseTime = Date.now() - startTime;
  state.metrics.avgPulseTime = state.metrics.avgPulseTime * PHI_INV + pulseTime * (1 - PHI_INV);
  
  state.health.score = Math.min(1.0, state.health.score * (1 + PHI_INV * 0.01));
  state.health.status = state.health.score > 0.8 ? 'green' : state.health.score > 0.5 ? 'yellow' : 'red';
  state.health.lastCheck = new Date().toISOString();
  
  return state;
}

// ── Process Task ──────────────────────────────────────────────────────────────
function processTask(task, state) {
  console.log(`  📋 Processing task: ${task.type} (${task.id})`);
  
  try {
    switch (task.type) {
      case TASK_TYPES.SPAWN:
        return spawnTask(task);
      case TASK_TYPES.EVOLVE:
        return evolveTask(task);
      case TASK_TYPES.HEAL:
        return healTask(task, state);
      case TASK_TYPES.OBSERVE:
        return observeTask(task);
      case TASK_TYPES.COMMIT:
        return commitTask(task);
      case TASK_TYPES.DIVERGE:
        return divergeTask(task);
      case TASK_TYPES.SYNC:
        return syncTask(task);
      default:
        return { success: false, error: `Unknown task type: ${task.type}` };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Task Implementations ──────────────────────────────────────────────────────
function spawnTask(task) {
  // Delegate to genesis-agent
  try {
    safeExecScript('genesis-agent.js', ['--census']);
    return { success: true, message: 'Census complete' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function evolveTask(task) {
  // Update divergence metrics
  try {
    safeExecScript('divergence-tracker.js', ['--update']);
    return { success: true, message: 'Evolution metrics updated' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function healTask(task, state) {
  // Self-healing: reset health if degraded
  if (state.health.score < 0.5) {
    state.health.score = PHI_INV;
    return { success: true, message: 'Health restored to phi-baseline' };
  }
  return { success: true, message: 'Health nominal' };
}

function observeTask(task) {
  const agents = loadAgentRegistry();
  return { 
    success: true, 
    message: `Observed ${agents.length} agents`,
    agents: agents.map(a => a.name),
  };
}

function commitTask(task) {
  // Record action to divergence ledger
  const event = {
    type: 'auto_commit',
    timestamp: new Date().toISOString(),
    task: task.id,
    agent: 'auto-orchestrator',
  };
  
  const ledgerFile = path.join(AUTO_DIR, 'ledger.jsonl');
  fs.appendFileSync(ledgerFile, JSON.stringify(event) + '\n');
  
  return { success: true, message: 'Committed to ledger' };
}

function divergeTask(task) {
  // Track divergence metrics
  try {
    const output = safeExecScript('divergence-tracker.js', ['--update']);
    return { success: true, message: 'Divergence tracked', output };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function syncTask(task) {
  // Synchronize state across subsystems
  const state = loadState();
  const agents = loadAgentRegistry();
  
  state.agents = {};
  agents.forEach(a => {
    state.agents[a.name] = {
      id: a.id,
      status: 'synced',
      fitness: a.fitness_score || PHI_INV,
      syncedAt: new Date().toISOString(),
    };
  });
  
  saveState(state);
  return { success: true, message: `Synced ${agents.length} agents` };
}

// ── Add Task to Queue ─────────────────────────────────────────────────────────
function addTask(type, payload = {}) {
  const queue = loadQueue();
  
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    priority: payload.priority || 1,
  };
  
  queue.tasks.push(task);
  queue.tasks.sort((a, b) => b.priority - a.priority);
  
  saveQueue(queue);
  return task;
}

// ── Display Functions ─────────────────────────────────────────────────────────
function displayStatus() {
  const state = loadState();
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🔄 AUTO ORCHESTRATOR STATUS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`  📊 Status:       ${state.status}`);
  console.log(`  💓 Pulse Count:  ${state.pulseCount}`);
  console.log(`  🔄 Cycle Count:  ${state.cycleCount}`);
  console.log(`  📅 Last Pulse:   ${state.lastPulse || 'Never'}`);
  console.log(`  📅 Last Updated: ${state.lastUpdated || 'Never'}`);
  
  console.log('\n  ❤️ Health');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Score:  ${(state.health.score * 100).toFixed(1)}%`);
  console.log(`    Status: ${state.health.status}`);
  
  console.log('\n  📈 Metrics');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Tasks Processed: ${state.metrics.tasksProcessed}`);
  console.log(`    Success Rate:    ${state.metrics.tasksProcessed > 0 ? ((state.metrics.tasksSuccess / state.metrics.tasksProcessed) * 100).toFixed(1) : 0}%`);
  console.log(`    Avg Pulse Time:  ${state.metrics.avgPulseTime.toFixed(2)}ms`);
  
  console.log('\n  🤖 Active Agents');
  console.log('  ─────────────────────────────────────────');
  const agentCount = Object.keys(state.agents || {}).length;
  console.log(`    Total: ${agentCount}`);
  
  const queue = loadQueue();
  console.log('\n  📋 Task Queue');
  console.log('  ─────────────────────────────────────────');
  console.log(`    Pending: ${queue.tasks.length}`);
  console.log(`    Processed: ${queue.processed.length}`);
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

function displayMetrics() {
  try {
    const output = safeExecScript('divergence-tracker.js', ['--metrics']);
    console.log(output);
  } catch (e) {
    console.log('  ⚠️ Could not load divergence metrics');
  }
}

function displayAgents() {
  const agents = loadAgentRegistry();
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🤖 REGISTERED AGENTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  if (agents.length === 0) {
    console.log('  📭 No agents registered yet');
  } else {
    agents.forEach(a => {
      console.log(`  ${a.emoji || '🤖'} ${a.name}`);
      console.log(`     ID:      ${a.id}`);
      console.log(`     Class:   ${a.class}`);
      console.log(`     Gen:     ${a.generation || 0}`);
      console.log(`     Fitness: ${a.fitness_score || 'N/A'}`);
      console.log('');
    });
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

function displayQueue() {
  const queue = loadQueue();
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  📋 TASK QUEUE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('  📬 Pending Tasks');
  console.log('  ─────────────────────────────────────────');
  if (queue.tasks.length === 0) {
    console.log('    (empty)');
  } else {
    queue.tasks.forEach((t, i) => {
      console.log(`    ${i + 1}. [${t.type}] ${t.id}`);
      console.log(`       Created: ${t.createdAt}`);
    });
  }
  
  console.log('\n  ✅ Recently Processed');
  console.log('  ─────────────────────────────────────────');
  const recent = queue.processed.slice(-5);
  if (recent.length === 0) {
    console.log('    (none)');
  } else {
    recent.forEach(t => {
      const status = t.result?.success ? '✅' : '❌';
      console.log(`    ${status} [${t.type}] ${t.id}`);
    });
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// ── Initialize AUTO ───────────────────────────────────────────────────────────
function initialize() {
  console.log('🔄 Initializing AUTO Orchestrator...\n');
  
  initDirectories();
  
  const state = createInitialState();
  state.status = 'initialized';
  state.started = new Date().toISOString();
  saveState(state);
  
  // Initialize queue with bootstrap tasks
  const queue = { tasks: [], processed: [] };
  saveQueue(queue);
  
  // Add initial tasks
  addTask(TASK_TYPES.SYNC, { priority: 3 });
  addTask(TASK_TYPES.OBSERVE, { priority: 2 });
  addTask(TASK_TYPES.DIVERGE, { priority: 1 });
  
  console.log('  ✅ State initialized');
  console.log('  ✅ Task queue created');
  console.log('  ✅ Bootstrap tasks queued');
  console.log('\n  🚀 AUTO ready. Run with --start to begin heartbeat loop.\n');
}

// ── Start AUTO Loop ───────────────────────────────────────────────────────────
function start() {
  console.log(`
═══════════════════════════════════════════════════════════════
  🔄 AUTO ORCHESTRATOR — Starting
═══════════════════════════════════════════════════════════════

  Heartbeat: ${HEARTBEAT_MS}ms (φ-encoded)
  Cycle:     ${CYCLE_INTERVAL.toFixed(0)}ms

  Press Ctrl+C to stop

═══════════════════════════════════════════════════════════════
`);
  
  let state = loadState();
  state.status = 'running';
  state.started = state.started || new Date().toISOString();
  saveState(state);
  
  // Heartbeat loop
  const heartbeat = () => {
    state = loadState();
    
    // Pulse
    state = pulse(state);
    state.cycleCount++;
    
    // Log pulse
    const health = state.health.status === 'green' ? '💚' : state.health.status === 'yellow' ? '💛' : '❤️';
    console.log(`  ${health} Pulse #${state.pulseCount} | Agents: ${Object.keys(state.agents).length} | Tasks: ${state.metrics.tasksProcessed}`);
    
    saveState(state);
  };
  
  // Start heartbeat
  heartbeat();
  const interval = setInterval(heartbeat, CYCLE_INTERVAL);
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n\n  🛑 Stopping AUTO Orchestrator...\n');
    clearInterval(interval);
    
    state = loadState();
    state.status = 'stopped';
    saveState(state);
    
    console.log('  ✅ State saved. AUTO stopped.\n');
    process.exit(0);
  });
}

// ── Single Pulse ──────────────────────────────────────────────────────────────
function singlePulse() {
  console.log('🔄 Single pulse...\n');
  
  initDirectories();
  
  let state = loadState();
  state = pulse(state);
  saveState(state);
  
  console.log(`  ✅ Pulse #${state.pulseCount} complete`);
  console.log(`  ❤️ Health: ${(state.health.score * 100).toFixed(1)}%`);
  console.log(`  📋 Tasks processed: ${state.metrics.tasksProcessed}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.init) {
  initialize();
} else if (args.start) {
  initDirectories();
  start();
} else if (args.status) {
  displayStatus();
} else if (args.pulse) {
  singlePulse();
} else if (args.metrics) {
  displayMetrics();
} else if (args.agents) {
  displayAgents();
} else if (args.queue) {
  displayQueue();
} else if (args.add) {
  initDirectories();
  const task = addTask(args.add, {});
  console.log(`📋 Task added: ${task.id}`);
} else {
  console.log(`
🔄 AUTO ORCHESTRATOR — Self-Sustaining Agent Runtime

Usage:
  --init      Initialize AUTO state and directories
  --start     Start the continuous heartbeat loop
  --stop      Stop AUTO (or use Ctrl+C)
  --status    Display current status
  --pulse     Run a single heartbeat pulse
  --metrics   Show divergence metrics
  --agents    List registered agents
  --queue     Show task queue
  --add=<type> Add task (spawn|evolve|heal|observe|commit|diverge|sync)

The AUTO orchestrator runs all internal AI agents in a continuous
phi-encoded rhythm (873ms heartbeat), creating a living system that
evolves autonomously as part of the divergence experiment.

Example:
  node auto-orchestrator.js --init    # Initialize
  node auto-orchestrator.js --start   # Start heartbeat loop
  node auto-orchestrator.js --pulse   # Single pulse
`);
}

module.exports = {
  loadState,
  saveState,
  pulse,
  addTask,
  loadAgentRegistry,
  TASK_TYPES,
  HEARTBEAT_MS,
  PHI,
};
