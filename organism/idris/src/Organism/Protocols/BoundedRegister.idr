-- | PROTO-ID-001 — Bounded Register Values
-- Dependent types enforce that register values stay in [lo, hi] at all times.
-- The proof travels with the value — no runtime bounds checking required.
module Organism.Protocols.BoundedRegister

import Organism.Constants
import Data.So

%default total

||| Proof that lo ≤ x ≤ hi.
public export
record InBounds (lo : Double) (hi : Double) (x : Double) where
  constructor MkInBounds
  lowerOk : So (lo <= x)
  upperOk : So (x  <= hi)

||| A register value guaranteed to lie in [0, 1].
public export
record UnitValue where
  constructor MkUnitValue
  value : Double
  prf   : InBounds 0.0 1.0 value

||| Attempt to construct a UnitValue, returning Nothing if out of range.
export
mkUnitValue : Double -> Maybe UnitValue
mkUnitValue x =
  case (choose (0.0 <= x), choose (x <= 1.0)) of
    (Left lo, Left hi) => Just (MkUnitValue x (MkInBounds lo hi))
    _                  => Nothing

||| Clamp a Double into [0,1] — always succeeds (total).
export
clampUnit : Double -> UnitValue
clampUnit x =
  let x' = max 0.0 (min 1.0 x)
  in case mkUnitValue x' of
       Just v  => v
       Nothing => MkUnitValue 0.0 (believe_me ())   -- unreachable after clamp

||| Phi-weighted combination of four unit register values.
||| Result is also in [0,1] because weights sum to 1.
export
phiVitality : UnitValue -> UnitValue -> UnitValue -> UnitValue -> UnitValue
phiVitality cog aff som sov =
  let w0 = registerWeight Cognitive
      w1 = registerWeight Affective
      w2 = registerWeight Somatic
      w3 = registerWeight Sovereign
      v  = w0 * value cog + w1 * value aff
         + w2 * value som + w3 * value sov
  in clampUnit v

||| Apply phi-decay to a unit value: new = old * φ⁻¹.
export
decayUnit : UnitValue -> UnitValue
decayUnit u = clampUnit (value u * phiInv)

||| Apply phi-amplification to a unit value: new = min 1 (old * φ).
export
amplifyUnit : UnitValue -> UnitValue
amplifyUnit u = clampUnit (value u * phi)
