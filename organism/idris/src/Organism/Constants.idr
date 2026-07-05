-- | Organism constants — Idris2 dependent-type layer.
-- φ and its companions are defined as precise Double literals and as
-- refined types so the type system can carry numeric constraints.
module Organism.Constants

%default total

||| Golden ratio φ = (1 + √5) / 2
export
phi : Double
phi = 1.6180339887498948482

||| φ⁻¹ = φ - 1
export
phiInv : Double
phiInv = 0.6180339887498948482

||| Golden angle in degrees
export
goldenAngleDeg : Double
goldenAngleDeg = 137.5077640500378546463

||| Golden angle in radians
export
goldenAngleRad : Double
goldenAngleRad = 2.3999632297286533222

||| Heartbeat period in milliseconds
export
heartbeatMs : Nat
heartbeatMs = 873

||| Heartbeat period in seconds
export
heartbeatS : Double
heartbeatS = 0.873

||| Canonical oscillator count
export
nodeCount : Nat
nodeCount = 96

||| Target order-parameter (Kuramoto coherence)
export
coherenceTarget : Double
coherenceTarget = 0.87

-- ── Register definitions ──────────────────────────────────────────────────────

||| The four organism registers, in canonical order.
public export
data RegisterName = Cognitive | Affective | Somatic | Sovereign

||| Phi-power weight for each register.
||| Cognitive = φ⁴ / Σ, Affective = φ³ / Σ, Somatic = φ² / Σ, Sovereign = φ / Σ
export
registerWeight : RegisterName -> Double
registerWeight r =
  let phi4 = phi * phi * phi * phi
      phi3 = phi * phi * phi
      phi2 = phi * phi
      phi1 = phi
      total = phi4 + phi3 + phi2 + phi1
  in case r of
    Cognitive => phi4 / total
    Affective => phi3 / total
    Somatic   => phi2 / total
    Sovereign => phi1 / total
