-- | Kuramoto phase-coupling and phi-decay in pure Haskell.
-- All functions are total and referentially transparent.
module Organism.Physics
  ( orderParameter, meanFieldStep, phiDecay, phiWeightedSum
  ) where

import Data.Complex (Complex(..), magnitude, phase, exp, mkPolar)
import Organism.Constants (phi, phiInv, heartbeatS, goldenAngleDeg)

-- | Kuramoto order parameter (R, ψ).
-- R ∈ [0,1]: synchrony. ψ: mean phase.
orderParameter :: [Double] -> (Double, Double)
orderParameter [] = (0, 0)
orderParameter phases =
  let n   = fromIntegral (length phases)
      z   = sum [ mkPolar 1 theta | theta <- phases ] / n
      r   = magnitude z
      psi = phase z
  in  (r, psi)

-- | Mean-field Kuramoto step (Euler). Mirrors organism.physics.mean_field_kuramoto_step.
meanFieldStep
  :: [Double]   -- ^ phases
  -> [Double]   -- ^ activities (per node)
  -> Double     -- ^ coupling K
  -> Double     -- ^ dt (seconds)
  -> [Double]   -- ^ updated phases
meanFieldStep phases activities k dt =
  let (r, psi) = orderParameter phases
      step theta act =
        let force = k * r * sin (psi - theta)
            next  = theta + force * dt * act
        in  next `fmod` (2 * pi)
  in  zipWith step phases activities

fmod :: Double -> Double -> Double
fmod x m = x - fromIntegral (floor (x / m) :: Int) * m

-- | Phi-weighted exponential decay.
-- half_life defaults to golden angle in seconds.
phiDecay :: Double -> Double -> Double -> Double
phiDecay initial ageS halfLifeS = initial * 0.5 ** (ageS / halfLifeS)

-- | Σ values[i] * φ^(-i), highest weight to first element.
phiWeightedSum :: [Double] -> Double
phiWeightedSum = go 1.0
  where
    go _ []     = 0
    go w (x:xs) = x * w + go (w / phi) xs
