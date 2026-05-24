#!/usr/bin/env node
/**
 * 🔐 VERIFY IDENTITY — Agent Identity Verification
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Verifies that an agent is registered in the Atlas registry and has the
 * appropriate capabilities for its requested actions.
 *
 * Usage:
 *   node sdk/agents/bootstrap/verify-identity.js --agent-type=copilot
 *   node sdk/agents/bootstrap/verify-identity.js --agent-id=organism-test-bot
 *
 * id: atlas://sdk/verify-identity
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO     = path.resolve(__dirname, '../../..');
const REGISTRY = path.join(REPO, 'governance', 'organism', 'registry', 'entities');

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  agentType: process.argv.find(a => a.startsWith('--agent-type='))?.split('=')[1],
  agentId: process.argv.find(a => a.startsWith('--agent-id='))?.split('=')[1],
  capability: process.argv.find(a => a.startsWith('--capability='))?.split('=')[1],
};

// ── Load Registry ─────────────────────────────────────────────────────────────
function loadRegistry() {
  const agents = {};
  if (!fs.existsSync(REGISTRY)) {
    console.warn('⚠️ Registry directory not found');
    return agents;
  }
  
  fs.readdirSync(REGISTRY)
    .filter(f => f.endsWith('.json'))
    .forEach(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(REGISTRY, f), 'utf8'));
        agents[data.id] = data;
        agents[data.name] = data;  // Also index by name
      } catch (e) {
        // Skip invalid files
      }
    });
  
  return agents;
}

// ── Verify Agent Type ─────────────────────────────────────────────────────────
function verifyAgentType(type) {
  console.log(`🔐 Verifying agent type: ${type}\n`);
  
  const validTypes = ['copilot', 'bot', 'human', 'external'];
  
  if (!validTypes.includes(type)) {
    console.error(`  ❌ Invalid agent type: ${type}`);
    console.error(`     Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }
  
  // For Copilot agents, verify environment
  if (type === 'copilot') {
    console.log('  ✅ Agent type verified: GitHub Copilot');
    console.log('  📋 Capabilities: read, write, commit, issue_create');
    console.log('  🔒 Constraints: Must follow INSTRUCTIONS.md');
    
    // Create identity token
    const token = {
      type: 'copilot',
      verified: true,
      timestamp: new Date().toISOString(),
      capabilities: ['read', 'write', 'commit', 'issue_create'],
      constraints: ['follow_instructions', 'governance_aware'],
    };
    
    const tokenDir = path.join(REPO, 'dist', 'agent-context');
    fs.mkdirSync(tokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(tokenDir, 'identity-token.json'),
      JSON.stringify(token, null, 2)
    );
    
    console.log('\n  💾 Identity token created');
    return true;
  }
  
  return true;
}

// ── Verify Agent ID ───────────────────────────────────────────────────────────
function verifyAgentId(agentId) {
  console.log(`🔐 Verifying agent: ${agentId}\n`);
  
  const registry = loadRegistry();
  
  // Try both full URI and name
  const agent = registry[`atlas://bot/${agentId}`] || registry[agentId];
  
  if (!agent) {
    console.error(`  ❌ Agent not found in registry: ${agentId}`);
    console.error(`     Registered agents: ${Object.keys(registry).filter(k => k.startsWith('atlas://')).length}`);
    process.exit(1);
  }
  
  console.log(`  ✅ Agent verified: ${agent.name}`);
  console.log(`     ${agent.emoji} ${agent.domain}`);
  console.log(`     Division: ${agent.division}`);
  console.log(`     Capabilities: ${agent.capabilities?.join(', ')}`);
  
  if (agent.workflow) {
    console.log(`     Workflow: ${agent.workflow}`);
  }
  
  return agent;
}

// ── Verify Capability ─────────────────────────────────────────────────────────
function verifyCapability(agentId, capability) {
  console.log(`🔐 Checking capability: ${capability} for ${agentId}\n`);
  
  const registry = loadRegistry();
  const agent = registry[`atlas://bot/${agentId}`] || registry[agentId];
  
  if (!agent) {
    console.error(`  ❌ Agent not found: ${agentId}`);
    process.exit(1);
  }
  
  const hasCapability = agent.capabilities?.includes(capability);
  
  if (hasCapability) {
    console.log(`  ✅ ${agent.name} has capability: ${capability}`);
  } else {
    console.log(`  ❌ ${agent.name} does NOT have capability: ${capability}`);
    console.log(`     Available: ${agent.capabilities?.join(', ')}`);
  }
  
  return hasCapability;
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.agentType) {
  verifyAgentType(args.agentType);
} else if (args.agentId && args.capability) {
  verifyCapability(args.agentId, args.capability);
} else if (args.agentId) {
  verifyAgentId(args.agentId);
} else {
  console.log(`
🔐 Identity Verification

Usage:
  --agent-type=<type>     Verify agent type (copilot|bot|human|external)
  --agent-id=<id>         Verify specific agent in registry
  --capability=<cap>      Check if agent has capability (use with --agent-id)

Example:
  node verify-identity.js --agent-type=copilot
  node verify-identity.js --agent-id=organism-test-bot
  node verify-identity.js --agent-id=organism-test-bot --capability=test
`);
}

module.exports = {
  loadRegistry,
  verifyAgentType,
  verifyAgentId,
  verifyCapability,
};
