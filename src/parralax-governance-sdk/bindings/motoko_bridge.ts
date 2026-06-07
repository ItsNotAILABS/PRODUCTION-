/**
 * Parralax Governance SDK - Motoko/ICP Bindings
 * Bridge between the Python governance engine and the Motoko canister layer.
 */

export interface GovernanceCanisterRef {
  canisterId: string;
  network: "local" | "ic";
  endpoint: string;
}

export interface PolicySubmission {
  ruleId: string;
  actorPrincipal: string;
  resourcePath: string;
  action: string;
  verdict: "allow" | "deny" | "escalate" | "defer";
}

export interface AuditEntry {
  timestamp: bigint;
  contextHash: string;
  actor: string;
  resource: string;
  ruleApplied: string;
  verdict: string;
}

export class MotokoGovernanceBridge {
  private canisterRef: GovernanceCanisterRef;
  private auditBuffer: AuditEntry[] = [];

  constructor(ref: GovernanceCanisterRef) {
    this.canisterRef = ref;
  }

  async submitPolicy(policy: PolicySubmission): Promise<{ ok: boolean; hash: string }> {
    const hash = await this.computeHash(JSON.stringify(policy));
    return { ok: true, hash };
  }

  async queryAuditTrail(actorPrincipal: string): Promise<AuditEntry[]> {
    return this.auditBuffer.filter((e) => e.actor === actorPrincipal);
  }

  async syncFromPython(engineState: string): Promise<void> {
    const state = JSON.parse(engineState);
    console.log(`[MotokoGovernanceBridge] Synced: ${state.policy_count} policies, ${state.audit_entries} entries`);
  }

  getCanisterEndpoint(): string {
    const base = this.canisterRef.network === "ic" ? "https://icp0.io" : "http://127.0.0.1:4943";
    return `${base}/api/v2/canister/${this.canisterRef.canisterId}`;
  }

  private async computeHash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }
}
