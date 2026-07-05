-- | Organism constants — PureScript bridge layer.
-- Mirrors the Haskell constants module; compiles to clean JavaScript.
module Organism.Constants
  ( phi, phiInv, goldenAngleDeg, goldenAngleRad
  , heartbeatMs, heartbeatS, nodeCount, coherenceTarget
  , RegisterName(..), registerWeight, allRegisters
  ) where

-- | Golden ratio φ
phi :: Number
phi = 1.6180339887498948482

-- | φ⁻¹
phiInv :: Number
phiInv = 0.6180339887498948482

-- | Golden angle in degrees
goldenAngleDeg :: Number
goldenAngleDeg = 137.5077640500378546463

-- | Golden angle in radians
goldenAngleRad :: Number
goldenAngleRad = 2.3999632297286533222

-- | Heartbeat in milliseconds
heartbeatMs :: Int
heartbeatMs = 873

-- | Heartbeat in seconds
heartbeatS :: Number
heartbeatS = 0.873

-- | Default oscillator count
nodeCount :: Int
nodeCount = 96

-- | Kuramoto coherence target
coherenceTarget :: Number
coherenceTarget = 0.87

-- | The four organism registers
data RegisterName = Cognitive | Affective | Somatic | Sovereign

derive instance Eq RegisterName
derive instance Ord RegisterName

instance Show RegisterName where
  show Cognitive = "Cognitive"
  show Affective = "Affective"
  show Somatic   = "Somatic"
  show Sovereign = "Sovereign"

-- | All registers in canonical order
allRegisters :: Array RegisterName
allRegisters = [Cognitive, Affective, Somatic, Sovereign]

-- | Phi-power weight for each register
registerWeight :: RegisterName -> Number
registerWeight r =
  let phi4  = phi * phi * phi * phi
      phi3  = phi * phi * phi
      phi2  = phi * phi
      phi1  = phi
      total = phi4 + phi3 + phi2 + phi1
  in case r of
    Cognitive => phi4 / total
    Affective => phi3 / total
    Somatic   => phi2 / total
    Sovereign => phi1 / total
