'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadCsv } = require('../_lib/csv.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

let _infraCodegenProtocol, _workflowProtocol;
try { _infraCodegenProtocol = require('../../protocols/infrastructure-codegen-protocol.js'); } catch {}
try { _workflowProtocol     = require('../../protocols/workflow-engine-protocol.js'); } catch {}

function tryExec(cmd) {
  try { return { ok: true, out: execSync(cmd, { cwd: REPO_ROOT, timeout: 60_000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }) }; }
  catch (e) { return { ok: false, err: e.message }; }
}

function isAvailable(bin) {
  return tryExec(`which ${bin}`).ok;
}

class HermesAgent {
  constructor() {
    this.id = 'HERMES';
    this.fleet = [];
    this._boot();
  }

  _boot() {
    try {
      this.fleet = loadCsv(path.join(REPO_ROOT, 'Cloudflare_Worker_Fleet_Register.csv'));
    } catch {}
  }

  getFleetStatus() {
    return this.fleet.map(w => ({
      id: w.worker_id,
      name: w.name,
      role: w.role,
      tier: w.tier,
      region: w.region,
      status: w.status,
      protocols: (w.primary_protocols || '').split(',').map(s => s.trim()).filter(Boolean),
    }));
  }

  generateWranglerConfig(workerId) {
    const worker = this.fleet.find(w => w.worker_id === workerId);
    if (!worker) return null;
    const name = worker.name.toLowerCase().replace(/\s+/g, '-');
    return [
      `name = "${name}"`,
      `main = "src/index.js"`,
      `compatibility_date = "${new Date().toISOString().slice(0, 10)}"`,
      ``,
      `[vars]`,
      `WORKER_ID = "${worker.worker_id}"`,
      `WORKER_ROLE = "${worker.role}"`,
      `HEARTBEAT_MS = "873"`,
      ``,
      `# Protocols wired to this worker:`,
      ...(worker.primary_protocols || '').split(',').map(p => `# ${p.trim()}`),
    ].join('\n');
  }

  generateDfxConfig(canisterId, name = 'organism') {
    return JSON.stringify({
      version: 1,
      canisters: {
        [name]: {
          type: 'motoko',
          main: `src/${name}/main.mo`,
          candid: `src/${name}/${name}.did`,
          metadata: [
            { name: 'candid:service', visibility: 'public' },
            { name: 'organism:canister_id', content: canisterId, visibility: 'public' },
            { name: 'organism:heartbeat_ms', content: '873', visibility: 'public' },
          ],
        },
      },
      networks: {
        local: { bind: '127.0.0.1:4943', type: 'ephemeral' },
        ic: { providers: ['https://ic0.app'], type: 'persistent' },
      },
    }, null, 2);
  }

  package(sdkName) {
    const sdkDir = path.join(REPO_ROOT, 'sdk', sdkName);
    if (!fs.existsSync(sdkDir)) return { ok: false, error: `SDK not found: ${sdkName}` };

    const pkgPath = path.join(sdkDir, 'package.json');
    const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { name: sdkName, version: '1.0.0' };

    const outDir = path.join(REPO_ROOT, 'dist', 'packages');
    fs.mkdirSync(outDir, { recursive: true });

    const artifactName = `${pkg.name || sdkName}-${pkg.version || '1.0.0'}.tar`;
    const artifactPath = path.join(outDir, artifactName);

    const tarResult = tryExec(`tar -cf "${artifactPath}" -C "${path.dirname(sdkDir)}" "${sdkName}"`);
    if (!tarResult.ok) return { ok: false, error: tarResult.err };

    const stat = fs.statSync(artifactPath);
    return { ok: true, artifactPath, artifactName, sizeBytes: stat.size, sdk: sdkName, version: pkg.version || '1.0.0' };
  }

  deploy(target, artifact) {
    const t = (target || '').toLowerCase();

    if (t === 'cloudflare' || t === 'cloudflare-workers') {
      if (!isAvailable('wrangler')) {
        return { ok: false, staged: true, message: 'wrangler CLI not found. Install with: npm i -g wrangler', artifact };
      }
      const res = tryExec(`wrangler deploy ${artifact}`);
      return { ok: res.ok, target, output: res.out || res.err };
    }

    if (t === 'icp' || t === 'motoko') {
      if (!isAvailable('dfx')) {
        return { ok: false, staged: true, message: 'dfx CLI not found. Install from: https://internetcomputer.org/docs/building-apps/getting-started/install', artifact };
      }
      const res = tryExec(`dfx deploy ${artifact || '--all'}`);
      return { ok: res.ok, target, output: res.out || res.err };
    }

    if (t === 'node' || t === 'npm') {
      const res = tryExec(`npm publish "${artifact}" --access public`);
      return { ok: res.ok, target, output: res.out || res.err };
    }

    return { ok: false, error: `Unknown target: ${target}. Supported: cloudflare, icp, node` };
  }

  // One-shot: package an SDK then deploy it to a target in a single call
  oneShot(sdkName, target = 'cloudflare') {
    const pkg = this.package(sdkName);
    if (!pkg.ok) return pkg;
    const dep = this.deploy(target, pkg.artifactPath);
    return { sdk: sdkName, target, package: pkg, deploy: dep };
  }

  /**
   * Generate infrastructure config using the codegen protocol.
   * target: 'cloudflare' | 'icp' | 'terraform' | 'compose' | 'github_ci'
   * spec: varies by target (see infrastructure-codegen-protocol.js)
   */
  generateInfrastructure(target, spec = {}) {
    if (!_infraCodegenProtocol) return { ok: false, error: 'infrastructure-codegen-protocol not loaded' };
    const { generate } = _infraCodegenProtocol;
    try {
      return { ok: true, ...generate(target, spec) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Create a named workflow for deployment orchestration.
   * templateName: 'onboarding' | 'release' | 'trade' | 'analysis' | 'build_site' | 'agent_eval'
   * context: { project?, env?, ... }
   * agentMap: { task_type: agent_id, ... }
   */
  createDeploymentWorkflow(templateName, context = {}, agentMap = {}) {
    if (!_workflowProtocol) return { ok: false, error: 'workflow-engine-protocol not loaded' };
    const { WorkflowInstance } = _workflowProtocol;
    try {
      const wf = new WorkflowInstance({ templateName, context, agentMap });
      return { ok: true, workflow: wf.snapshot() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /** List available workflow templates. */
  listDeploymentWorkflows() {
    if (!_workflowProtocol) return [];
    return _workflowProtocol.listTemplates();
  }

  status() {
    return {
      id: this.id,
      fleetWorkers: this.fleet.length,
      cloudflareAvailable: isAvailable('wrangler'),
      dfxAvailable: isAvailable('dfx'),
      infraCodegenLoaded: !!_infraCodegenProtocol,
      workflowLoaded: !!_workflowProtocol,
    };
  }
}

module.exports = { HermesAgent };
