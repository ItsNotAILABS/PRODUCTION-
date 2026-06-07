// Governance Canister - On-chain governance state for Parralax SDK
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import HashMap "mo:base/HashMap";
import Text "mo:base/Text";
import Array "mo:base/Array";
import Nat "mo:base/Nat";

actor Governance {
    type PolicyVerdict = { #allow; #deny; #escalate; #defer; };
    type GovernanceRecord = {
        actor: Principal; resource: Text; action: Text;
        verdict: PolicyVerdict; timestamp: Int; provenanceHash: Text;
    };

    stable var records: [GovernanceRecord] = [];
    stable var policyCount: Nat = 0;

    public shared(msg) func submitRecord(resource: Text, action: Text, verdict: PolicyVerdict, provenanceHash: Text) : async Nat {
        let record: GovernanceRecord = { actor = msg.caller; resource = resource; action = action; verdict = verdict; timestamp = Time.now(); provenanceHash = provenanceHash; };
        records := Array.append(records, [record]);
        return records.size();
    };

    public query func getAuditTrail(actor: Principal) : async [GovernanceRecord] {
        return Array.filter<GovernanceRecord>(records, func(r) { r.actor == actor });
    };

    public query func getRecordCount() : async Nat { return records.size(); };
    public query func health() : async Text { return "Governance canister operational. Records: " # Nat.toText(records.size()); };
};
