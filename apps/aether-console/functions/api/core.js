/**
 * Aether Sovereign Console — transport-agnostic route core.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Pure state + dispatch logic, no Request/Response/KV references. Two
 * transports import this same module so they can't drift apart:
 *   - functions/api/[[path]].js  — Cloudflare Pages Functions (KV-backed)
 *   - apps/aether-desktop/main.js — Electron app (local JSON file-backed)
 *
 * Mirrors aether_platform/api/router.py's shape on the Python side: one
 * `route(method, path, body, state)` function returning
 * { status, data, dirty }, where `dirty` tells the caller whether to
 * persist the (mutated in place) state object.
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 0.618033988749895;
const HEARTBEAT_MS = 873;

const RING = Object.freeze({
  SOVEREIGN: 0, SOVEREIGN_EDGE: 1, COGNITIVE: 2, NEURAL: 3, MEMORY: 4,
  ROUTE: 5, AFFECTIVE: 6, SOMATIC: 7, QUANTUM: 8, TEMPORAL: 9, INTERFACE: 10,
});
const RING_NAME = Object.fromEntries(Object.entries(RING).map(([k, v]) => [v, k]));

const ACTION_RING_REQUIREMENTS = {
  DEPLOY: RING.COGNITIVE, ROLLBACK: RING.SOVEREIGN_EDGE, DELETE: RING.SOVEREIGN,
  SCALE: RING.NEURAL, VIEW_SECRETS: RING.SOVEREIGN_EDGE, REGISTER: RING.ROUTE,
  AUDIT: RING.MEMORY, READ: RING.INTERFACE,
};

const TARGET_CLASS = Object.freeze({
  CLOUDFLARE_WORKER: 'cloudflare_worker', ICP_CANISTER: 'icp_canister',
  LAMBDA_FUNCTION: 'lambda_function', EDGE_FUNCTION: 'edge_function', BARE_METAL: 'bare_metal',
});

const TARGET_STATUS = Object.freeze({
  HEALTHY: 'healthy', DEGRADED: 'degraded', UNREACHABLE: 'unreachable',
  PROVISIONING: 'provisioning', DECOMMISSIONED: 'decommissioned',
});

const WORKLOAD_KIND = Object.freeze({
  AGENT: 'agent', WORKER: 'worker', CANISTER: 'canister',
  FUNCTION: 'function', PROTOCOL: 'protocol', PIPELINE: 'pipeline',
});

const DEPLOY_PHASE = Object.freeze({
  PENDING: 'pending', VALIDATING: 'validating', SCHEDULING: 'scheduling',
  DEPLOYING: 'deploying', VERIFYING: 'verifying', SUCCEEDED: 'succeeded',
  FAILED: 'failed', ROLLED_BACK: 'rolled_back',
});

const PROTOCOL_REGISTRY = [
  { protocol_id: 'PROTO-FED-001', name: 'Agent Federation Mesh', ring_affinity: ['SOVEREIGN', 'COGNITIVE'], memory_mb: 256, cpu_millicores: 500, isolation: 'PROCESS', type: 'mesh' },
  { protocol_id: 'PROTO-WORK-001', name: 'Task Orchestration DAG', ring_affinity: ['COGNITIVE', 'ROUTE'], memory_mb: 256, cpu_millicores: 500, isolation: 'PROCESS', type: 'orchestrator' },
  { protocol_id: 'PROTO-GEN-001', name: 'Multimodal Synthesis', ring_affinity: ['NEURAL', 'COGNITIVE'], memory_mb: 512, cpu_millicores: 1000, isolation: 'PROCESS', type: 'fusion' },
  { protocol_id: 'PROTO-GEN-002', name: 'Website Generation', ring_affinity: ['INTERFACE', 'MEMORY'], memory_mb: 256, cpu_millicores: 500, isolation: 'PROCESS', type: 'codegen' },
  { protocol_id: 'PROTO-FIN-001', name: 'Finance Signal Processor', ring_affinity: ['SOVEREIGN'], memory_mb: 512, cpu_millicores: 1000, isolation: 'CONTAINER', type: 'signal' },
  { protocol_id: 'PROTO-FIN-002', name: 'Trading Execution', ring_affinity: ['SOVEREIGN'], memory_mb: 512, cpu_millicores: 2000, isolation: 'CONTAINER', type: 'execution' },
  { protocol_id: 'PROTO-INFRA-001', name: 'Infrastructure Codegen', ring_affinity: ['COGNITIVE', 'ROUTE'], memory_mb: 256, cpu_millicores: 500, isolation: 'PROCESS', type: 'codegen' },
  { protocol_id: 'PROTO-AI-001', name: 'AI Evaluation', ring_affinity: ['COGNITIVE', 'NEURAL'], memory_mb: 512, cpu_millicores: 1000, isolation: 'PROCESS', type: 'eval' },
  { protocol_id: 'PROTO-FED-002', name: 'Sovereign Federation', ring_affinity: ['SOVEREIGN', 'SOVEREIGN_EDGE'], memory_mb: 512, cpu_millicores: 1000, isolation: 'CONTAINER', type: 'mesh' },
  { protocol_id: 'PROTO-WORK-002', name: 'Workflow Engine', ring_affinity: ['COGNITIVE', 'ROUTE', 'INTERFACE'], memory_mb: 512, cpu_millicores: 1000, isolation: 'PROCESS', type: 'workflow' },
  { protocol_id: 'PROTO-FIN-003', name: 'Trading Signals', ring_affinity: ['SOVEREIGN'], memory_mb: 512, cpu_millicores: 2000, isolation: 'CONTAINER', type: 'signal' },
  { protocol_id: 'PROTO-FIN-004', name: 'Portfolio Optimization', ring_affinity: ['SOVEREIGN'], memory_mb: 512, cpu_millicores: 2000, isolation: 'CONTAINER', type: 'optimization' },
  { protocol_id: 'PROTO-AI-002', name: 'Model Orchestration', ring_affinity: ['COGNITIVE', 'NEURAL'], memory_mb: 1024, cpu_millicores: 2000, isolation: 'CONTAINER', type: 'orchestration' },
  { protocol_id: 'PROTO-ARCH-001', name: 'Architecture Discovery', ring_affinity: ['COGNITIVE', 'MEMORY'], memory_mb: 256, cpu_millicores: 500, isolation: 'PROCESS', type: 'analysis' },
  { protocol_id: 'PROTO-GEN-003', name: 'Site Analytics', ring_affinity: ['INTERFACE', 'AFFECTIVE'], memory_mb: 512, cpu_millicores: 500, isolation: 'PROCESS', type: 'analytics' },
  { protocol_id: 'PROTO-GEN-004', name: 'Content Generation', ring_affinity: ['INTERFACE', 'MEMORY'], memory_mb: 256, cpu_millicores: 500, isolation: 'PROCESS', type: 'codegen' },
];

function makeCloudflareTarget(name, accountId, subdomain) {
  const id = `cf-${name.toLowerCase().replace(/\s+/g, '-')}`;
  return {
    target_id: id, name, target_class: TARGET_CLASS.CLOUDFLARE_WORKER,
    endpoint: `https://${subdomain}.workers.dev`, account_id: accountId,
    status: TARGET_STATUS.PROVISIONING, labels: {}, annotations: {},
    registered_at: Date.now(), last_heartbeat: Date.now(), heartbeat_latency_ms: 0,
    phi_score: 1.0, deployed_workloads: [], regions: ['global'],
  };
}

function makeIcpTarget(name, canisterId, network = 'ic') {
  const id = `icp-${canisterId.slice(0, 8)}`;
  return {
    target_id: id, name, target_class: TARGET_CLASS.ICP_CANISTER,
    endpoint: `https://${canisterId}.icp0.io`, account_id: '',
    status: TARGET_STATUS.PROVISIONING, labels: {}, annotations: {},
    registered_at: Date.now(), last_heartbeat: Date.now(), heartbeat_latency_ms: 0,
    phi_score: 1.0, deployed_workloads: [], regions: ['icp-mainnet'], canister_id: canisterId, dfx_network: network,
  };
}

function freshState() {
  const state = {
    beat: 0,
    targets: {},
    workloads: {},
    principals: {
      'admin-001': { principal_id: 'admin-001', name: 'Platform Admin', ring: RING.SOVEREIGN, scopes: [] },
    },
    auditLog: [],
    deployHistory: [],
  };

  const t1 = makeCloudflareTarget('Aether-Edge-1', 'demo-account', 'aether-edge-1');
  const t2 = makeCloudflareTarget('Aether-Edge-2', 'demo-account', 'aether-edge-2');
  const t3 = makeIcpTarget('Aether-ICP-1', 'rrkah-fqaaa-aaaaa-aaaaq-cai');
  for (const t of [t1, t2, t3]) {
    t.last_heartbeat = Date.now();
    t.heartbeat_latency_ms = 12.0;
    t.status = TARGET_STATUS.HEALTHY;
    state.targets[t.target_id] = t;
  }
  return state;
}

function isAlive(target) {
  return (Date.now() - target.last_heartbeat) < 30000;
}

function targetToDict(t) {
  return {
    target_id: t.target_id, name: t.name, class: t.target_class,
    endpoint: t.endpoint, status: t.status, phi_score: +t.phi_score.toFixed(4),
    heartbeat_latency_ms: t.heartbeat_latency_ms, is_alive: isAlive(t),
    deployed_count: t.deployed_workloads.length, labels: t.labels, regions: t.regions,
  };
}

function fleetCoherence(state) {
  const total = Object.keys(state.targets).length;
  if (total === 0) return 0;
  const healthy = Object.values(state.targets).filter(isAlive).length;
  return healthy / total;
}

function fleetSnapshot(state) {
  const targets = Object.values(state.targets);
  const healthy = targets.filter(t => isAlive(t) && t.status === TARGET_STATUS.HEALTHY);
  const coherence = fleetCoherence(state);
  const byClass = {};
  for (const cls of Object.values(TARGET_CLASS)) {
    byClass[cls] = healthy.filter(t => t.target_class === cls).length;
  }
  return {
    beat: state.beat, total_targets: targets.length, healthy_targets: healthy.length,
    coherence: +coherence.toFixed(4), is_coherent: coherence >= PHI_INV,
    global_phi_score: 1.0, targets_by_class: byClass,
    targets: targets.map(targetToDict),
  };
}

function bestTarget(state, labels = {}) {
  const healthy = Object.values(state.targets).filter(t => isAlive(t) && t.status === TARGET_STATUS.HEALTHY);
  if (healthy.length === 0) return null;
  const ranked = healthy.map(t => {
    let score = t.phi_score;
    const matches = Object.entries(labels).filter(([k, v]) => t.labels[k] === v).length;
    score *= Math.pow(PHI, matches);
    return { t, score };
  }).sort((a, b) => b.score - a.score);
  return ranked[0].t;
}

function workloadToDict(w) {
  return {
    workload_id: w.workload_id, name: w.name, kind: w.kind, image_ref: w.image_ref,
    target_class: w.target_class, replicas: w.replicas, phase: w.deploy_phase,
    phi_score: +w.phi_score.toFixed(4), deployed_to: w.deployed_to,
  };
}

function doDeployTick(state) {
  const result = { beat: state.beat, coherence: fleetCoherence(state), deployed: [], skipped: [], failed: [] };
  if (fleetCoherence(state) < PHI_INV) {
    result.status = 'coherence_gate_blocked';
    return result;
  }
  result.status = 'running';

  const pending = Object.values(state.workloads).filter(w => w.deploy_phase === DEPLOY_PHASE.PENDING);
  for (const w of pending) {
    const target = bestTarget(state, w.labels || {});
    if (!target) { result.skipped.push(w.workload_id); continue; }

    w.deploy_phase = DEPLOY_PHASE.DEPLOYING;
    const success = true;
    if (success) {
      w.deploy_phase = DEPLOY_PHASE.SUCCEEDED;
      w.phi_score = Math.min(PHI, w.phi_score * PHI);
      if (!w.deployed_to.includes(target.target_id)) w.deployed_to.push(target.target_id);
      target.phi_score = Math.min(PHI, target.phi_score * PHI);
      if (!target.deployed_workloads.includes(w.workload_id)) target.deployed_workloads.push(w.workload_id);
      state.deployHistory.push({ beat: state.beat, ts: Date.now(), target_id: target.target_id, workload_id: w.workload_id, success: true });
      result.deployed.push(w.workload_id);
    } else {
      w.deploy_phase = DEPLOY_PHASE.FAILED;
      w.phi_score = Math.max(0.01, w.phi_score * PHI_INV);
      result.failed.push(w.workload_id);
    }
  }
  state.beat++;
  if (state.deployHistory.length > 200) state.deployHistory = state.deployHistory.slice(-200);
  return result;
}

function policyEvaluate(state, principalId, action, scope) {
  const principal = state.principals[principalId];
  const required = ACTION_RING_REQUIREMENTS[action] ?? RING.SOVEREIGN;
  let decision;
  if (!principal) {
    decision = { allowed: false, principal_id: principalId, action, scope: scope || null, reason: 'unknown_principal' };
  } else if (principal.ring <= required && (!principal.scopes.length || !scope || principal.scopes.includes(scope))) {
    decision = { allowed: true, principal_id: principalId, action, scope: scope || null, reason: `ring_${RING_NAME[principal.ring]}_authorized` };
  } else {
    decision = { allowed: false, principal_id: principalId, action, scope: scope || null, reason: `insufficient_ring: has ${RING_NAME[principal.ring]}, needs ${RING_NAME[required]}` };
  }
  state.auditLog.push(decision);
  if (state.auditLog.length > 500) state.auditLog = state.auditLog.slice(-500);
  return decision;
}

function policySnapshot(state) {
  return {
    principals: Object.values(state.principals).map(p => ({ id: p.principal_id, name: p.name, ring: RING_NAME[p.ring], scopes: p.scopes })),
    audit_log_size: state.auditLog.length,
  };
}

function registerProtocolWorkload(state, protocolId, targetClass, replicas) {
  const spec = PROTOCOL_REGISTRY.find(p => p.protocol_id === protocolId);
  if (!spec) return null;

  const cls = targetClass || (spec.ring_affinity.includes('SOVEREIGN_EDGE') ? TARGET_CLASS.EDGE_FUNCTION : TARGET_CLASS.CLOUDFLARE_WORKER);
  const workload = {
    workload_id: protocolId, name: spec.name, kind: WORKLOAD_KIND.PROTOCOL,
    image_ref: `protocols/${spec.protocol_id}`, target_class: cls, replicas: replicas || 1,
    env: { PROTOCOL_ID: protocolId, HEARTBEAT_MS: String(HEARTBEAT_MS), PHI: String(PHI) },
    labels: { protocol: protocolId, type: spec.type, ring: spec.ring_affinity.join(','), isolation: spec.isolation },
    phi_score: 1.0, deploy_phase: DEPLOY_PHASE.PENDING, deployed_to: [], created_at: Date.now(),
  };
  state.workloads[protocolId] = workload;
  return workload;
}

/**
 * Dispatch one request against `state` (mutated in place).
 * Returns { status, data, dirty } — `dirty` tells the transport whether
 * state changed and should be persisted.
 */
function route(method, path, body, state) {
  const parts = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  let dirty = false;
  const ok = (status, data) => ({ status, data, dirty });

  if (method === 'GET') {
    if (parts.length === 1 && parts[0] === 'health') {
      return ok(200, { status: 'sovereign', beat: state.beat, fleet_coherence: +fleetCoherence(state).toFixed(4), ts: Date.now() });
    }
    if (parts.length === 1 && parts[0] === 'fleet') return ok(200, fleetSnapshot(state));
    if (parts.length === 2 && parts[0] === 'fleet') {
      const t = state.targets[parts[1]];
      return ok(t ? 200 : 404, t ? targetToDict(t) : { error: 'not_found' });
    }
    if (parts.length === 1 && parts[0] === 'workloads') return ok(200, Object.values(state.workloads).map(workloadToDict));
    if (parts.length === 1 && parts[0] === 'platform') {
      return ok(200, {
        beat: state.beat, fleet: fleetSnapshot(state),
        workloads: Object.values(state.workloads).map(workloadToDict),
        pending_count: Object.values(state.workloads).filter(w => w.deploy_phase === DEPLOY_PHASE.PENDING).length,
        protocol_registry: { total_protocols: PROTOCOL_REGISTRY.length, protocols: PROTOCOL_REGISTRY },
      });
    }
    if (parts.length === 1 && parts[0] === 'policy') return ok(200, policySnapshot(state));
    if (parts.length === 2 && parts[0] === 'policy' && parts[1] === 'audit') return ok(200, state.auditLog.slice(-100));
    if (parts.length === 1 && parts[0] === 'protocols') return ok(200, PROTOCOL_REGISTRY);
    if (parts.length === 2 && parts[0] === 'protocols') {
      const w = state.workloads[parts[1]];
      const spec = PROTOCOL_REGISTRY.find(p => p.protocol_id === parts[1]);
      if (!spec) return ok(404, { error: 'not_found' });
      return ok(200, w ? workloadToDict(w) : { ...spec, deployed: false });
    }
    return ok(404, { error: 'not_found' });
  }

  if (method === 'POST') {
    if (parts.length === 2 && parts[0] === 'fleet' && parts[1] === 'register') {
      let t;
      if ((body.class || 'cloudflare_worker') === 'cloudflare_worker') {
        t = makeCloudflareTarget(body.name || 'unnamed', body.account_id || '', body.subdomain || '');
      } else if (body.class === 'icp_canister') {
        t = makeIcpTarget(body.name || 'unnamed', body.canister_id || '', body.network || 'ic');
      } else {
        return ok(400, { error: 'unknown_class' });
      }
      state.targets[t.target_id] = t;
      dirty = true;
      return { status: 201, data: targetToDict(t), dirty };
    }
    if (parts.length === 2 && parts[0] === 'fleet' && parts[1] === 'tick') {
      const result = doDeployTick(state);
      return { status: 200, data: result, dirty: true };
    }
    if (parts.length === 3 && parts[0] === 'fleet' && parts[2] === 'heartbeat') {
      const t = state.targets[parts[1]];
      if (!t) return ok(404, { ok: false });
      t.last_heartbeat = Date.now();
      t.heartbeat_latency_ms = body.latency_ms || 0;
      t.status = TARGET_STATUS.HEALTHY;
      return { status: 200, data: { ok: true }, dirty: true };
    }
    if (parts.length === 1 && parts[0] === 'workloads') {
      const w = {
        workload_id: body.workload_id || `wl-${Date.now()}`,
        name: body.name || 'unnamed',
        kind: body.kind || WORKLOAD_KIND.AGENT,
        image_ref: body.image_ref || '',
        target_class: body.target_class || TARGET_CLASS.CLOUDFLARE_WORKER,
        replicas: body.replicas || 1,
        env: body.env || {},
        labels: body.labels || {},
        phi_score: 1.0, deploy_phase: DEPLOY_PHASE.PENDING, deployed_to: [], created_at: Date.now(),
      };
      state.workloads[w.workload_id] = w;
      const tick = doDeployTick(state);
      return { status: 201, data: { workload: workloadToDict(w), deploy_result: tick }, dirty: true };
    }
    if (parts.length === 3 && parts[0] === 'workloads' && parts[2] === 'rollback') {
      const w = state.workloads[parts[1]];
      if (!w) return ok(404, { ok: false });
      w.deploy_phase = DEPLOY_PHASE.ROLLED_BACK;
      w.deployed_to = [];
      w.phi_score *= PHI_INV;
      return { status: 200, data: { ok: true }, dirty: true };
    }
    if (parts.length === 2 && parts[0] === 'policy' && parts[1] === 'evaluate') {
      const decision = policyEvaluate(state, body.principal_id || '', (body.action || 'READ').toUpperCase(), body.scope);
      return { status: 200, data: decision, dirty: true };
    }
    if (parts.length === 3 && parts[0] === 'protocols' && parts[2] === 'deploy') {
      const w = registerProtocolWorkload(state, parts[1], body.target_class, body.replicas);
      if (!w) return ok(404, { error: `protocol_not_found: ${parts[1]}` });
      const tick = doDeployTick(state);
      return { status: 201, data: { workload: workloadToDict(w), deploy_result: tick }, dirty: true };
    }
    return ok(404, { error: 'not_found' });
  }

  return ok(405, { error: 'method_not_allowed' });
}

module.exports = {
  PHI, PHI_INV, HEARTBEAT_MS, RING, RING_NAME, ACTION_RING_REQUIREMENTS,
  TARGET_CLASS, TARGET_STATUS, WORKLOAD_KIND, DEPLOY_PHASE, PROTOCOL_REGISTRY,
  freshState, route,
};
