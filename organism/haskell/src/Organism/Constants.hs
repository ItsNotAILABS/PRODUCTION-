-- | Phi-encoded constants — the mathematical foundation of the organism.
module Organism.Constants
  ( phi, phiInv, phiSq, goldenAngleDeg, goldenAngleRad
  , heartbeatMs, heartbeatS, nodeCount, coherenceTarget
  , RegisterName(..), allRegisters
  , registerWeight
  ) where

-- | Golden ratio φ = (1 + √5) / 2
phi :: Double
phi = 1.618033988749895

phiInv :: Double
phiInv = 1.0 / phi

phiSq :: Double
phiSq = phi * phi

goldenAngleDeg :: Double
goldenAngleDeg = 137.508

goldenAngleRad :: Double
goldenAngleRad = goldenAngleDeg * pi / 180.0

heartbeatMs :: Int
heartbeatMs = 873

heartbeatS :: Double
heartbeatS = fromIntegral heartbeatMs / 1000.0

nodeCount :: Int
nodeCount = 96

coherenceTarget :: Double
coherenceTarget = 0.87

-- | The 4 register names of the sovereign organism state.
data RegisterName = Cognitive | Affective | Somatic | Sovereign
  deriving (Show, Eq, Ord, Enum, Bounded)

allRegisters :: [RegisterName]
allRegisters = [minBound .. maxBound]

-- | Phi-power weight for each register, normalised to sum 1.
-- Sovereign = φ⁴ > Cognitive = φ³ > Affective = φ² > Somatic = φ¹
registerWeight :: RegisterName -> Double
registerWeight r = raw r / total
  where
    raw Cognitive = phi ^ (3 :: Int)
    raw Affective = phi ^ (2 :: Int)
    raw Somatic   = phi ^ (1 :: Int)
    raw Sovereign = phi ^ (4 :: Int)
    total = sum (map raw allRegisters)
