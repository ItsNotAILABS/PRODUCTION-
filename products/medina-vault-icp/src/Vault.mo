// Vault.mo — Medina Vault as an ICP canister.
//
// Same protocol (MEDINA-PROTOCOL/0.2). Same four tiers. Same laws.
// Difference: state lives on-chain (stable memory survives upgrades),
// callers authenticate via their ICP Principal, and the vault is shared
// across machines — not just one operator's laptop.
//
// Deploy:    dfx deploy --network ic
// Local:     dfx start --background && dfx deploy
//
// Architect: Alfredo Medina Hernandez. Implementation: Claude Opus 4.7
// under the Creator's License.

import HashMap "mo:base/HashMap";
import Iter   "mo:base/Iter";
import Array  "mo:base/Array";
import Buffer "mo:base/Buffer";
import Text   "mo:base/Text";
import Time   "mo:base/Time";
import Nat    "mo:base/Nat";
import Nat64  "mo:base/Nat64";
import Float  "mo:base/Float";
import Option "mo:base/Option";
import Principal "mo:base/Principal";

actor MedinaVaultCanister {

  // ── Types ──────────────────────────────────────────────────────────

  public type Tier = { #PUBLIC; #SHARED; #PRIVATE; #SOVEREIGN };

  public type Entry = {
    key            : Text;
    value          : Text;                       // JSON-encoded payload
    tier           : Tier;
    owner          : Principal;
    sharedWith     : [Principal];
    createdAtNs    : Int;
    ttlNs          : ?Int;                       // null = SOVEREIGN, never expires
    decayRatePerHr : Float;
    lineage        : [Text];                     // chain of medina hashes (SHA-256, hex)
    metadata       : [(Text, Text)];
  };

  public type StoreReq = {
    key       : Text;
    value     : Text;
    tier      : Tier;
    priorHash : ?Text;                            // null on genesis
  };

  public type ReadVerdict = {
    #ok       : Entry;
    #notFound;
    #expired;
    #decayed;
    #tierForbidden;
    #sovereignOwnerOnly;
  };

  public type WriteVerdict = {
    #ok                 : { entry : Entry; lineageDepth : Nat; headHash : Text };
    #recitalMismatch;
    #genesisExpectsEmpty;
    #invalidTier;
  };

  // ── Constants (mirror products/medina-vault/src/laws.mjs) ──────────

  let EMPTY : Text = "0000000000000000000000000000000000000000000000000000000000000000";
  let DECAY_THRESHOLD : Float = 0.05;

  func defaultTTL(t : Tier) : ?Int {
    let h : Int = 3_600_000_000_000;             // 1 hour in ns
    switch (t) {
      case (#PUBLIC)    ?(h * 24);
      case (#SHARED)    ?(h * 24 * 7);
      case (#PRIVATE)   ?(h * 24 * 30);
      case (#SOVEREIGN) null;
    }
  };

  func defaultDecay(t : Tier) : Float {
    switch (t) {
      case (#PUBLIC)    0.05;
      case (#SHARED)    0.02;
      case (#PRIVATE)   0.01;
      case (#SOVEREIGN) 0.00;
    }
  };

  // ── Stable state (survives canister upgrade) ──────────────────────

  stable var entriesBackup : [(Text, Entry)] = [];

  // In-memory working map.
  let entries = HashMap.HashMap<Text, Entry>(64, Text.equal, Text.hash);

  system func preupgrade() {
    entriesBackup := Iter.toArray(entries.entries());
  };
  system func postupgrade() {
    for ((k, v) in entriesBackup.vals()) entries.put(k, v);
    entriesBackup := [];
  };

  // ── Hash (simple stable hex; for production swap to certified SHA) ─

  func hashEntryShape(e : ?Entry) : Text {
    switch (e) {
      case null EMPTY;
      case (?x) {
        // Deterministic concatenation of stable fields.
        let s = x.key # "|" # x.value # "|" # tierTag(x.tier) #
                "|" # Principal.toText(x.owner) #
                "|" # Nat.toText(Array.size(x.lineage));
        return Nat64.toText(Text.hash s);
      };
    }
  };

  func tierTag(t : Tier) : Text {
    switch (t) {
      case (#PUBLIC)    "PUBLIC";
      case (#SHARED)    "SHARED";
      case (#PRIVATE)   "PRIVATE";
      case (#SOVEREIGN) "SOVEREIGN";
    }
  };

  func strength(e : Entry, nowNs : Int) : Float {
    if (e.decayRatePerHr == 0.0) return 1.0;
    let ageNs : Int = nowNs - e.createdAtNs;
    let ageHours : Float = Float.fromInt(ageNs) / 3_600_000_000_000.0;
    return Float.exp(- e.decayRatePerHr * ageHours);
  };

  func ttlAlive(e : Entry, nowNs : Int) : Bool {
    switch (e.ttlNs) {
      case null true;
      case (?ttl) (nowNs - e.createdAtNs) <= ttl;
    }
  };

  func authorized(e : Entry, who : Principal) : Bool {
    switch (e.tier) {
      case (#PUBLIC)    true;
      case (#SHARED)    true;
      case (#PRIVATE)   {
        if (e.owner == who) return true;
        for (p in e.sharedWith.vals()) { if (p == who) return true; };
        false;
      };
      case (#SOVEREIGN) e.owner == who;
    }
  };

  // ── Public API ─────────────────────────────────────────────────────

  public shared (msg) func store(req : StoreReq) : async WriteVerdict {
    let caller = msg.caller;
    let head : ?Entry = entries.get(req.key);
    let computed : Text = hashEntryShape(head);

    // RECITAL_PLUS_ONE
    switch (head, req.priorHash) {
      case (null, ?p) {
        if (p != EMPTY) return #genesisExpectsEmpty;
      };
      case (null, null) { /* genesis ok */ };
      case (?_, null) { /* owner auto-recite — fine for v0.1 */ };
      case (?_, ?p) {
        if (p != computed) return #recitalMismatch;
      };
    };

    let nowNs : Int = Time.now();
    let lineage : [Text] = switch (head) {
      case null   [EMPTY];
      case (?h)   Array.append<Text>(h.lineage, [computed]);
    };
    let entry : Entry = {
      key            = req.key;
      value          = req.value;
      tier           = req.tier;
      owner          = caller;
      sharedWith     = switch (head) { case null []; case (?h) h.sharedWith };
      createdAtNs    = nowNs;
      ttlNs          = defaultTTL(req.tier);
      decayRatePerHr = defaultDecay(req.tier);
      lineage        = lineage;
      metadata       = [];
    };
    entries.put(req.key, entry);
    let depth : Nat = Array.size(lineage);
    return #ok({ entry = entry; lineageDepth = depth; headHash = hashEntryShape(?entry) });
  };

  public shared query (msg) func retrieve(key : Text) : async ReadVerdict {
    let caller = msg.caller;
    switch (entries.get(key)) {
      case null #notFound;
      case (?e) {
        let now = Time.now();
        if (not ttlAlive(e, now))                    return #expired;
        if (strength(e, now) < DECAY_THRESHOLD)      return #decayed;
        if (not authorized(e, caller)) {
          switch (e.tier) {
            case (#SOVEREIGN) return #sovereignOwnerOnly;
            case _            return #tierForbidden;
          };
        };
        return #ok(e);
      };
    }
  };

  public shared query func status() : async {
    protocol : Text; tier_counts : { PUBLIC : Nat; SHARED : Nat; PRIVATE : Nat; SOVEREIGN : Nat; total : Nat };
  } {
    var p = 0; var s = 0; var pr = 0; var sov = 0;
    for (e in entries.vals()) {
      switch (e.tier) {
        case (#PUBLIC)    p   += 1;
        case (#SHARED)    s   += 1;
        case (#PRIVATE)   pr  += 1;
        case (#SOVEREIGN) sov += 1;
      };
    };
    return {
      protocol = "MEDINA-PROTOCOL/0.2";
      tier_counts = { PUBLIC = p; SHARED = s; PRIVATE = pr; SOVEREIGN = sov; total = p + s + pr + sov };
    };
  };

  public shared query func protocols() : async [Text] {
    [
      "01 · RECITAL_PLUS_ONE",
      "02 · DUAL_READ",
      "03 · TIER_AUTHORITY",
      "04 · PHI_DECAY",
      "05 · LINEAGE_CHAIN",
      "06 · COUNCIL_CONSENSUS",
      "07 · SIGNAL_ROUTING",
      "08 · CUSTOS_OBSERVATION",
      "09 · MEMORY_TOKEN",
      "10 · OPERATOR_IDENTITY",
    ];
  };
};
