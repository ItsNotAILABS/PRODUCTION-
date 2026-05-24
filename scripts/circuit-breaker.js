#!/usr/bin/env node
/**
 * 🛡️ CIRCUIT BREAKER — Emergency Safety System
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The circuit breaker is the ultimate safety mechanism for the autonomous
 * organism. When triggered, it halts ALL autonomous operations immediately.
 *
 * Usage:
 *   node scripts/circuit-breaker.js --check
 *   node scripts/circuit-breaker.js --trigger --reason="Manual halt"
 *   node scripts/circuit-breaker.js --reset --approval=<token>
 *   node scripts/circuit-breaker.js --status
 *
 * id: atlas://safety/circuit-breaker
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PHI = 1.618033988749895;

const REPO         = path.resolve(__dirname, '..');
const SAFETY_DIR   = path.join(REPO, 'dist', 'safety');
const BREAKER_FILE = path.join(SAFETY_DIR, 'circuit-breaker.json');
const AUDIT_FILE   = path.join(SAFETY_DIR, 'circuit-breaker-audit.jsonl');
const REGISTRY_DIR = path.join(REPO, 'governance', 'organism', 'registry', 'entities');

// ── Circuit Breaker State ─────────────────────────────────────────────────────
const DEFAULT_STATE = {
  active: false,
  triggeredAt: null,
  triggeredBy: null,
  reason: null,
  triggers: [],
  resetAt: null,
  resetBy: null,
  incidentId: null,
};

// ── Trigger Conditions ────────────────────────────────────────────────────────
const TRIGGERS = {
  SECRET_DETECTED: {
    id: 'CB_SECRET_DETECTED',
    severity: 'critical',
    check: (context) => context.findings?.includes('secret_leak') || 
                        context.findings?.includes('credential_exposure'),
    message: 'Secret or credential detected',
  },
  MASS_FAILURE: {
    id: 'CB_MASS_FAILURE',
    severity: 'critical',
    check: (context) => (context.failed_bots || 0) >= 5,
    message: '5+ bots failed simultaneously',
  },
  CRITICAL_CVE: {
    id: 'CB_CRITICAL_CVE',
    severity: 'critical',
    check: (context) => (context.findings?.filter(f => f.startsWith('cve:critical')).length || 0) >= 3,
    message: '3+ critical CVEs detected',
  },
  EXTREME_RISK: {
    id: 'CB_RISK_EXTREME',
    severity: 'critical',
    check: (context) => (context.risk_score || 0) > 0.95,
    message: 'Extreme risk score (>0.95)',
  },
  RUNAWAY_AGENT: {
    id: 'CB_RUNAWAY_AGENT',
    severity: 'high',
    check: (context) => (context.agent_commits_per_hour || 0) > 50,
    message: 'Agent making excessive commits (>50/hour)',
  },
  EXTREME_DIVERGENCE: {
    id: 'CB_DIVERGENCE_EXTREME',
    severity: 'high',
    check: (context) => (context.divergence_rate || 0) > 0.9,
    message: 'Extreme divergence rate (>0.9)',
  },
};

// ── Parse Arguments ───────────────────────────────────────────────────────────
const args = {
  check: process.argv.includes('--check'),
  trigger: process.argv.includes('--trigger'),
  reset: process.argv.includes('--reset'),
  status: process.argv.includes('--status'),
  reason: process.argv.find(a => a.startsWith('--reason='))?.split('=')[1],
  approval: process.argv.find(a => a.startsWith('--approval='))?.split('=')[1],
  context: process.argv.find(a => a.startsWith('--context='))?.split('=')[1],
};

// ── Initialize Safety Directory ───────────────────────────────────────────────
function initSafetyDir() {
  fs.mkdirSync(SAFETY_DIR, { recursive: true });
  if (!fs.existsSync(BREAKER_FILE)) {
    fs.writeFileSync(BREAKER_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

// ── Load State ────────────────────────────────────────────────────────────────
function loadState() {
  initSafetyDir();
  try {
    return JSON.parse(fs.readFileSync(BREAKER_FILE, 'utf8'));
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

// ── Save State ────────────────────────────────────────────────────────────────
function saveState(state) {
  initSafetyDir();
  fs.writeFileSync(BREAKER_FILE, JSON.stringify(state, null, 2));
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
function auditLog(event) {
  initSafetyDir();
  const entry = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
}

// ── Check Triggers ────────────────────────────────────────────────────────────
function checkTriggers(context = {}) {
  console.log('🛡️ Checking circuit breaker conditions...\n');
  
  const state = loadState();
  const triggeredConditions = [];
  
  for (const [name, trigger] of Object.entries(TRIGGERS)) {
    try {
      if (trigger.check(context)) {
        triggeredConditions.push({
          id: trigger.id,
          name,
          severity: trigger.severity,
          message: trigger.message,
        });
        console.log(`  🔴 TRIGGERED: ${name} — ${trigger.message}`);
      } else {
        console.log(`  🟢 OK: ${name}`);
      }
    } catch (e) {
      console.log(`  ⚠️ CHECK ERROR: ${name} — ${e.message}`);
    }
  }
  
  if (triggeredConditions.length > 0 && !state.active) {
    // Trigger circuit breaker
    triggerBreaker(triggeredConditions, 'Automatic trigger');
  } else if (triggeredConditions.length === 0) {
    console.log('\n  ✅ All conditions clear');
  }
  
  return triggeredConditions;
}

// ── Trigger Circuit Breaker ───────────────────────────────────────────────────
function triggerBreaker(conditions, reason) {
  console.log('\n🚨 CIRCUIT BREAKER TRIGGERED 🚨\n');
  
  const state = loadState();
  const incidentId = `INC-${Date.now()}`;
  
  state.active = true;
  state.triggeredAt = new Date().toISOString();
  state.triggeredBy = 'circuit-breaker-system';
  state.reason = reason;
  state.triggers = conditions || [];
  state.incidentId = incidentId;
  
  saveState(state);
  
  auditLog({
    event: 'CIRCUIT_BREAKER_TRIGGERED',
    incidentId,
    reason,
    triggers: conditions,
  });
  
  console.log(`  📛 Incident ID: ${incidentId}`);
  console.log(`  📅 Time: ${state.triggeredAt}`);
  console.log(`  📝 Reason: ${reason}`);
  
  if (conditions && conditions.length > 0) {
    console.log('\n  Triggered conditions:');
    conditions.forEach(c => {
      console.log(`    - [${c.severity.toUpperCase()}] ${c.name}: ${c.message}`);
    });
  }
  
  console.log('\n  🛑 ALL AUTONOMOUS OPERATIONS ARE NOW HALTED');
  console.log('  ⚠️ Human intervention required to reset');
  
  // Create incident marker file
  const incidentFile = path.join(SAFETY_DIR, 'CIRCUIT_BREAKER_ACTIVE');
  fs.writeFileSync(incidentFile, `Incident: ${incidentId}\nTime: ${state.triggeredAt}\nReason: ${reason}`);
  
  return state;
}

// ── Reset Circuit Breaker ─────────────────────────────────────────────────────
function resetBreaker(approval) {
  console.log('🛡️ Attempting to reset circuit breaker...\n');
  
  const state = loadState();
  
  if (!state.active) {
    console.log('  ⚠️ Circuit breaker is not currently active');
    return false;
  }
  
  // In production, this would verify the approval token
  // For now, we just require any approval value
  if (!approval) {
    console.log('  ❌ Reset requires --approval=<token>');
    console.log('     Human approval is required to reset the circuit breaker');
    return false;
  }
  
  state.active = false;
  state.resetAt = new Date().toISOString();
  state.resetBy = approval;
  
  saveState(state);
  
  auditLog({
    event: 'CIRCUIT_BREAKER_RESET',
    incidentId: state.incidentId,
    resetBy: approval,
  });
  
  // Remove incident marker
  const incidentFile = path.join(SAFETY_DIR, 'CIRCUIT_BREAKER_ACTIVE');
  if (fs.existsSync(incidentFile)) {
    fs.unlinkSync(incidentFile);
  }
  
  console.log('  ✅ Circuit breaker has been reset');
  console.log(`  📅 Reset time: ${state.resetAt}`);
  console.log(`  👤 Reset by: ${approval}`);
  console.log('\n  🟢 Autonomous operations may now resume');
  
  return true;
}

// ── Display Status ────────────────────────────────────────────────────────────
function displayStatus() {
  const state = loadState();
  
  console.log('🛡️ Circuit Breaker Status\n');
  console.log('═'.repeat(50));
  
  if (state.active) {
    console.log('\n  🔴 STATUS: ACTIVE — ALL AUTOMATION HALTED\n');
    console.log(`  📛 Incident ID: ${state.incidentId}`);
    console.log(`  📅 Triggered: ${state.triggeredAt}`);
    console.log(`  📝 Reason: ${state.reason}`);
    
    if (state.triggers && state.triggers.length > 0) {
      console.log('\n  Triggered conditions:');
      state.triggers.forEach(t => {
        console.log(`    - [${t.severity}] ${t.name}`);
      });
    }
    
    console.log('\n  ⚠️ Run --reset --approval=<token> to restore operations');
  } else {
    console.log('\n  🟢 STATUS: INACTIVE — Operations normal\n');
    
    if (state.resetAt) {
      console.log(`  Last incident: ${state.incidentId || 'Unknown'}`);
      console.log(`  Reset at: ${state.resetAt}`);
      console.log(`  Reset by: ${state.resetBy}`);
    }
  }
  
  console.log('\n═'.repeat(50));
  
  return state;
}

// ── Is Active Check ───────────────────────────────────────────────────────────
function isActive() {
  const state = loadState();
  return state.active;
}

// ── Main ──────────────────────────────────────────────────────────────────────
initSafetyDir();

if (args.check) {
  let context = {};
  if (args.context) {
    try {
      context = JSON.parse(fs.readFileSync(args.context, 'utf8'));
    } catch (e) {
      try {
        context = JSON.parse(args.context);
      } catch (e2) {
        console.error('Invalid context JSON');
      }
    }
  }
  checkTriggers(context);
} else if (args.trigger) {
  triggerBreaker([], args.reason || 'Manual trigger');
} else if (args.reset) {
  resetBreaker(args.approval);
} else if (args.status) {
  displayStatus();
} else {
  console.log(`
🛡️ Circuit Breaker — Emergency Safety System

Usage:
  --check               Check all trigger conditions
    --context=<json>    Context data for checks (file or inline JSON)
    
  --trigger             Manually trigger circuit breaker
    --reason=<reason>   Reason for manual trigger
    
  --reset               Reset circuit breaker (requires approval)
    --approval=<token>  Approval token from authorized human
    
  --status              Display current status

Example:
  node circuit-breaker.js --status
  node circuit-breaker.js --check
  node circuit-breaker.js --trigger --reason="Emergency maintenance"
  node circuit-breaker.js --reset --approval=admin-auth-token
`);
}

module.exports = {
  loadState,
  saveState,
  checkTriggers,
  triggerBreaker,
  resetBreaker,
  isActive,
  TRIGGERS,
};
