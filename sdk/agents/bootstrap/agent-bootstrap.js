#!/usr/bin/env node
/**
 * 🚀 AGENT BOOTSTRAP — Initialization Protocol
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Initializes the agent runtime environment by:
 *   1. Loading governance context (OCL charter, CPL-L laws)
 *   2. Registering agent identity in Atlas
 *   3. Establishing communication channels
 *   4. Starting the φ-locked heartbeat
 *
 * Usage:
 *   node sdk/agents/bootstrap/agent-bootstrap.js --init
 *   node sdk/agents/bootstrap/agent-bootstrap.js --agent-id=organism-test-bot
 *
 * id: atlas://sdk/agent-bootstrap
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────────────
const PHI         = 1.618033988749895;
const PHI_INV     = 1 / PHI;
const HEARTBEAT_MS = 873;  // φ-locked interval

const REPO        = path.resolve(__dirname, '../../..');
const GOVERNANCE  = path.join(REPO, 'governance');
const OCL_FILE    = path.join(GOVERNANCE, 'organism', 'bot-fleet.ocl');
const LAWS_DIR    = path.join(GOVERNANCE, 'laws');
const REGISTRY    = path.join(GOVERNANCE, 'organism', 'registry', 'entities');
const CONTEXT_DIR = path.join(REPO, 'dist', 'agent-context');

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  init: process.argv.includes('--init'),
  agentId: process.argv.find(a => a.startsWith('--agent-id='))?.split('=')[1],
  verify: process.argv.includes('--verify'),
  heartbeat: process.argv.includes('--heartbeat'),
};

// ── OCL Parser (simplified) ───────────────────────────────────────────────────
function parseOCL(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  
  const ocl = {
    id: content.match(/^id:\s*"([^"]+)"/m)?.[1],
    version: content.match(/^version:\s*"([^"]+)"/m)?.[1],
    capabilities: [],
    limits: [],
    drives: {},
    governance: {},
  };

  // Extract capabilities
  const capMatch = content.match(/capabilities:\n((?:\s+-\s*"[^"]+"\n?)+)/);
  if (capMatch) {
    ocl.capabilities = capMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract limits
  const limitMatch = content.match(/limits:\n((?:\s+-\s*"[^"]+"\n?)+)/);
  if (limitMatch) {
    ocl.limits = limitMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  }

  // Extract drives
  const drivesMatch = content.match(/drives:\n((?:\s+\w+:\s+[\d.]+\n?)+)/);
  if (drivesMatch) {
    drivesMatch[1].split('\n').forEach(line => {
      const match = line.match(/(\w+):\s+([\d.]+)/);
      if (match) ocl.drives[match[1]] = parseFloat(match[2]);
    });
  }

  // Extract governance
  const govMatch = content.match(/governance:\n((?:\s+\w+:\s+.+\n?)+)/);
  if (govMatch) {
    govMatch[1].split('\n').forEach(line => {
      const match = line.match(/(\w+):\s+(.+)/);
      if (match) {
        const val = match[2].trim();
        ocl.governance[match[1]] = isNaN(val) ? val : parseFloat(val);
      }
    });
  }

  return ocl;
}

// ── Load Laws ─────────────────────────────────────────────────────────────────
function loadLaws() {
  const laws = [];
  if (!fs.existsSync(LAWS_DIR)) return laws;
  
  fs.readdirSync(LAWS_DIR)
    .filter(f => f.endsWith('.cpl-l'))
    .forEach(f => {
      const content = fs.readFileSync(path.join(LAWS_DIR, f), 'utf8');
      laws.push({
        file: f,
        id: content.match(/^id:\s*"([^"]+)"/m)?.[1] || f,
        version: content.match(/^version:\s*"([^"]+)"/m)?.[1] || '1.0.0',
      });
    });
  
  return laws;
}

// ── Load Agent Registry ───────────────────────────────────────────────────────
function loadRegistry() {
  const agents = {};
  if (!fs.existsSync(REGISTRY)) return agents;
  
  fs.readdirSync(REGISTRY)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REGISTRY, f), 'utf8'));
        agents[data.id] = data;
      } catch (e) {
        console.warn(`  ⚠️ Failed to parse registry file: ${f}`);
      }
    });
  
  return agents;
}

// ── Initialize Agent Context ──────────────────────────────────────────────────
function initContext() {
  console.log('🚀 Agent Bootstrap — Initializing...\n');
  
  fs.mkdirSync(CONTEXT_DIR, { recursive: true });
  
  // Load governance
  console.log('  📜 Loading OCL charter...');
  const ocl = parseOCL(OCL_FILE);
  if (!ocl) {
    console.error('  ❌ Failed to load OCL charter');
    process.exit(1);
  }
  console.log(`     ✅ Loaded: ${ocl.id} v${ocl.version}`);
  console.log(`     📋 Capabilities: ${ocl.capabilities.length}`);
  console.log(`     🚫 Limits: ${ocl.limits.length}`);
  
  // Load laws
  console.log('\n  ⚖️ Loading CPL-L laws...');
  const laws = loadLaws();
  console.log(`     ✅ Loaded ${laws.length} law files`);
  
  // Load registry
  console.log('\n  📋 Loading Atlas registry...');
  const registry = loadRegistry();
  const agentCount = Object.keys(registry).length;
  console.log(`     ✅ Loaded ${agentCount} registered agents`);
  
  // Create context file
  const context = {
    timestamp: new Date().toISOString(),
    phi: PHI,
    phiInv: PHI_INV,
    heartbeatMs: HEARTBEAT_MS,
    ocl,
    laws: laws.map(l => l.id),
    agentCount,
    healthStatus: 'green',  // Default, updated by governance engine
    riskScore: 0.1,         // Default, updated by governance engine
  };
  
  const contextPath = path.join(CONTEXT_DIR, 'governance.json');
  fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
  console.log(`\n  💾 Context saved to: ${contextPath}`);
  
  // Create agent manifest
  const manifest = {
    initialized: context.timestamp,
    agents: Object.values(registry).map(a => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      domain: a.domain,
      capabilities: a.capabilities,
    })),
  };
  
  const manifestPath = path.join(CONTEXT_DIR, 'agent-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  💾 Manifest saved to: ${manifestPath}`);
  
  console.log('\n✅ Agent bootstrap complete!\n');
  
  return context;
}

// ── Verify Agent Identity ─────────────────────────────────────────────────────
function verifyAgent(agentId) {
  console.log(`🔍 Verifying agent: ${agentId}\n`);
  
  const registry = loadRegistry();
  const fullId = agentId.startsWith('atlas://') ? agentId : `atlas://bot/${agentId}`;
  
  if (!registry[fullId]) {
    console.error(`  ❌ Agent not found in registry: ${fullId}`);
    return false;
  }
  
  const agent = registry[fullId];
  console.log(`  ✅ Agent verified: ${agent.name}`);
  console.log(`     ${agent.emoji} ${agent.domain}`);
  console.log(`     📋 Capabilities: ${agent.capabilities?.join(', ')}`);
  
  return true;
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function startHeartbeat() {
  console.log(`💓 Starting φ-locked heartbeat (${HEARTBEAT_MS}ms)...\n`);
  
  let beatCount = 0;
  const interval = setInterval(() => {
    beatCount++;
    const phi_beat = beatCount * PHI_INV;
    console.log(`  💓 Beat ${beatCount} | φ-phase: ${phi_beat.toFixed(3)}`);
    
    // Update heartbeat file
    const heartbeatPath = path.join(CONTEXT_DIR, 'heartbeat.json');
    fs.writeFileSync(heartbeatPath, JSON.stringify({
      beat: beatCount,
      phiPhase: phi_beat,
      timestamp: new Date().toISOString(),
    }, null, 2));
    
    // Stop after 10 beats in demo mode
    if (beatCount >= 10) {
      console.log('\n  ⏹️ Demo heartbeat complete');
      clearInterval(interval);
    }
  }, HEARTBEAT_MS);
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.init) {
  initContext();
} else if (args.agentId) {
  verifyAgent(args.agentId);
} else if (args.heartbeat) {
  startHeartbeat();
} else {
  console.log(`
🚀 Agent Bootstrap

Usage:
  --init              Initialize agent context
  --agent-id=<id>     Verify agent identity
  --heartbeat         Start φ-locked heartbeat demo

Example:
  node agent-bootstrap.js --init
  node agent-bootstrap.js --agent-id=organism-test-bot
`);
}

module.exports = {
  PHI,
  PHI_INV,
  HEARTBEAT_MS,
  parseOCL,
  loadLaws,
  loadRegistry,
  initContext,
  verifyAgent,
};
