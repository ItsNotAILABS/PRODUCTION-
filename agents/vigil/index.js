'use strict';

const fs = require('fs');
const path = require('path');
const { loadCsv } = require('../_lib/csv.js');

const PHI = 1.618033988749895;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let _sovereignFedProtocol, _infraCodegenProtocol;
try { _sovereignFedProtocol  = require('../../protocols/sovereign-federation-protocol.js'); } catch {}
try { _infraCodegenProtocol  = require('../../protocols/infrastructure-codegen-protocol.js'); } catch {}

function phiHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9 | 0);
    h ^= Math.floor(Math.abs(h) * PHI);
  }
  return ((h >>> 0).toString(16).padStart(8, '0'));
}

class VigilAgent {
  constructor() {
    this.id = 'VIGIL';
    this.laws = [];
    this.sdks = [];
    this.violations = [];
    this.auditedAt = null;
    this._boot();
  }

  _boot() {
    this.laws = loadCsv(path.join(REPO_ROOT, 'Architectural_Laws_Register.csv'));
    this.sdks = this._discoverSDKs();
  }

  _discoverSDKs() {
    const sdkRoot = path.join(REPO_ROOT, 'sdk');
    const extRoot = path.join(REPO_ROOT, 'extensions');
    const results = [];
    const scanDir = (dir, kind) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const pkgPath = path.join(dir, e.name, 'package.json');
        const manPath = path.join(dir, e.name, 'manifest.json');
        const pkg = this._tryRead(pkgPath) || this._tryRead(manPath);
        results.push({ name: e.name, kind, dir: path.join(dir, e.name), pkg });
      }
    };
    scanDir(sdkRoot, 'sdk');
    scanDir(extRoot, 'extension');
    return results;
  }

  _tryRead(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
  }

  audit(sdkNameFilter = null) {
    this.violations = [];
    const targets = sdkNameFilter
      ? this.sdks.filter(s => s.name === sdkNameFilter)
      : this.sdks;

    for (const sdk of targets) {
      for (const law of this.laws) {
        const violation = this._checkLaw(sdk, law);
        if (violation) this.violations.push(violation);
      }
    }

    this.auditedAt = new Date().toISOString();
    const sdkCount = targets.length;
    const lawCount = this.laws.length;
    const violCount = this.violations.length;

    return {
      auditedAt: this.auditedAt,
      sdksScanned: sdkCount,
      lawsApplied: lawCount,
      violations: violCount,
      compliant: violCount === 0,
      report: this.violations,
    };
  }

  _checkLaw(sdk, law) {
    // Check sdk_affinity match: if the law names a specific SDK and this isn't it, skip
    if (law.sdk_affinity && sdk.pkg) {
      const affin = law.sdk_affinity.replace('@medina/', '');
      // Law applies broadly to all SDKs in the relevant domain
    }
    // Structural containment law: SDK must have a package.json or manifest.json
    if (law.law_id === 'AL-001' && !sdk.pkg) {
      return { lawId: law.law_id, law: law.law_name, sdk: sdk.name, issue: 'Missing package.json / manifest.json — structural boundary undefined' };
    }
    // Compositional atomicity: each SDK should declare its own version
    if (law.law_id === 'AL-003' && sdk.pkg && !sdk.pkg.version) {
      return { lawId: law.law_id, law: law.law_name, sdk: sdk.name, issue: 'No version declared — violates compositional atomicity' };
    }
    return null;
  }

  getViolations(lawId = null) {
    if (!this.auditedAt) this.audit();
    return lawId
      ? this.violations.filter(v => v.lawId === lawId)
      : this.violations;
  }

  enforce(lawId) {
    const law = this.laws.find(l => l.law_id === lawId);
    if (!law) return { error: `Law ${lawId} not found` };
    const violations = this.sdks.map(sdk => this._checkLaw(sdk, law)).filter(Boolean);
    return { law: law.law_name, statement: law.statement, violations, compliant: violations.length === 0 };
  }

  sign(artifact) {
    const payload = typeof artifact === 'string' ? artifact : JSON.stringify(artifact);
    const ts = Date.now();
    const h1 = phiHash(payload);
    const h2 = phiHash(h1 + ts.toString());
    const h3 = phiHash(h2 + String(Math.floor(ts * PHI)));
    return {
      signer: this.id,
      timestamp: new Date(ts).toISOString(),
      signature: `VIGIL-${h1}-${h2}-${h3}`,
      phiEncoded: true,
    };
  }

  /**
   * Initialize and return a SovereignFederation view of the substrate fleet.
   * Registers each discovered SDK as an EDGE substrate node.
   */
  federationView() {
    if (!_sovereignFedProtocol) return { ok: false, error: 'sovereign-federation-protocol not loaded' };
    const { SovereignFederation, SubstrateNode, SUBSTRATE } = _sovereignFedProtocol;
    if (!this._federation) {
      const self = new SubstrateNode({ id: this.id, name: 'Vigil', substrate: SUBSTRATE.GATEWAY });
      this._federation = new SovereignFederation(self);
      for (const sdk of this.sdks) {
        const node = new SubstrateNode({
          id:        sdk.name,
          name:      sdk.name,
          substrate: SUBSTRATE.EDGE,
          ring:      'SovereignRing',
        });
        this._federation.addNode(node);
      }
    }
    return this._federation.snapshot();
  }

  /**
   * Generate infrastructure config for any supported target.
   * target: 'cloudflare' | 'icp' | 'terraform' | 'compose' | 'github_ci'
   */
  generateConfig(target, spec = {}) {
    if (!_infraCodegenProtocol) return { ok: false, error: 'infrastructure-codegen-protocol not loaded' };
    const { generate } = _infraCodegenProtocol;
    try {
      return { ok: true, ...generate(target, spec) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * Audit the federation: compare alive substrate nodes vs. full roster,
   * treat low coherence as a compliance violation.
   */
  auditFederation() {
    if (!_sovereignFedProtocol) return { ok: false, error: 'sovereign-federation-protocol not loaded' };
    const view = this.federationView();
    const coherence = parseFloat(view.coherence);
    const PHI_INV = 0.618033988749895;
    const violation = coherence < PHI_INV
      ? { issue: `Federation coherence ${coherence.toFixed(4)} below phi-threshold ${PHI_INV}` }
      : null;
    return {
      coherence,
      compliant: !violation,
      violation,
      aliveNodes: view.nodes?.filter(n => n.alive).length ?? 0,
      totalNodes: view.nodes?.length ?? 0,
    };
  }

  status() {
    return {
      id: this.id,
      laws: this.laws.length,
      sdksTracked: this.sdks.length,
      lastAudit: this.auditedAt,
      violations: this.violations.length,
      sovereignFedLoaded: !!_sovereignFedProtocol,
      infraCodegenLoaded: !!_infraCodegenProtocol,
    };
  }
}

module.exports = { VigilAgent };
