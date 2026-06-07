// Celestial Sync Canister - On-chain temporal state
import Time "mo:base/Time";
import Array "mo:base/Array";
import Text "mo:base/Text";
import Nat "mo:base/Nat";
import Int "mo:base/Int";

actor CelestialSync {
    type WayebPhase = { #introspection; #consolidation; #purification; #realignment; #emergence; };
    type SyncCheckpoint = { cycleNumber: Nat; phase: WayebPhase; timestamp: Int; modulesAligned: Nat; notes: Text; };
    type TemporalHookState = { hookId: Text; trigger: Text; lastFired: Int; fireCount: Nat; enabled: Bool; };

    stable var checkpoints: [SyncCheckpoint] = [];
    stable var hookStates: [TemporalHookState] = [];
    stable var currentCycle: Nat = 0;

    public shared func recordCheckpoint(phase: WayebPhase, modulesAligned: Nat, notes: Text) : async Nat {
        currentCycle += 1;
        let checkpoint: SyncCheckpoint = { cycleNumber = currentCycle; phase = phase; timestamp = Time.now(); modulesAligned = modulesAligned; notes = notes; };
        checkpoints := Array.append(checkpoints, [checkpoint]);
        return currentCycle;
    };

    public shared func updateHookState(hookId: Text, trigger: Text, fireCount: Nat, enabled: Bool) : async () {
        let state: TemporalHookState = { hookId = hookId; trigger = trigger; lastFired = Time.now(); fireCount = fireCount; enabled = enabled; };
        hookStates := Array.append(hookStates, [state]);
    };

    public query func getCurrentCycle() : async Nat { return currentCycle; };
    public query func getRecentCheckpoints(count: Nat) : async [SyncCheckpoint] {
        let size = checkpoints.size();
        if (size <= count) { return checkpoints; };
        let start = size - count;
        return Array.tabulate<SyncCheckpoint>(count, func(i) { checkpoints[start + i] });
    };
    public query func health() : async Text { return "CelestialSync operational. Cycle: " # Nat.toText(currentCycle); };
};
