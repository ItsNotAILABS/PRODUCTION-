-- | PROTO-PS-004 — Kuramoto Synchrony Engine (PureScript → JS)
-- The mean-field Kuramoto model in PureScript.
-- Compiles to zero-dependency JavaScript; runs on Cloudflare Workers, ICP,
-- and any browser. Matches the Python and Haskell reference implementations.
module Organism.Protocols.KuramotoJS
  ( OscillatorState, mkOscillators, orderParameter
  , meanFieldStep, integrateN, synchronyLevel
  ) where

import Prelude
import Data.Array (range, length, zipWith, foldl, map, replicate) as Array
import Organism.Constants (phi, heartbeatS, coherenceTarget)

-- | State of N oscillators
type OscillatorState =
  { phases    :: Array Number   -- ^ θᵢ in radians
  , activities :: Array Number  -- ^ aᵢ ∈ [0,1]
  , coupling  :: Number         -- ^ global K
  }

-- | Initialise N oscillators with golden-angle spaced phases.
mkOscillators :: Int -> Number -> OscillatorState
mkOscillators n coupling =
  let goldenAngleRad = 2.3999632297286533222
      phases     = map (\i -> goldenAngleRad * toNumber i) (Array.range 0 (n - 1))
      activities = Array.replicate n 1.0
  in { phases, activities, coupling }

-- | Kuramoto order parameter R and mean phase ψ.
-- R = |Σ exp(iθⱼ)| / N
orderParameter :: Array Number -> { r :: Number, psi :: Number }
orderParameter phases =
  let n    = toNumber (Array.length phases)
      re   = Array.foldl (\acc th -> acc + cos th) 0.0 phases / n
      im   = Array.foldl (\acc th -> acc + sin th) 0.0 phases / n
      r    = sqrt (re * re + im * im)
      psi  = atan2 im re
  in { r, psi }

-- | One mean-field Euler step: θᵢ' = θᵢ + dt·K·R·sin(ψ - θᵢ)·aᵢ
meanFieldStep :: OscillatorState -> Number -> OscillatorState
meanFieldStep s dt =
  let { r, psi } = orderParameter s.phases
      newPhases  = Array.zipWith
        (\theta activity -> theta + dt * s.coupling * r * sin (psi - theta) * activity)
        s.phases
        s.activities
  in s { phases = newPhases }

-- | Integrate for n steps using the heartbeat timestep.
integrateN :: OscillatorState -> Int -> OscillatorState
integrateN s 0 = s
integrateN s n = integrateN (meanFieldStep s heartbeatS) (n - 1)

-- | Classify synchrony level.
synchronyLevel :: OscillatorState -> String
synchronyLevel s =
  let { r } = orderParameter s.phases
  in if r >= coherenceTarget     then "sovereign"
     else if r >= coherenceTarget * phi_inv then "coherent"
     else if r >= 0.5            then "forming"
     else                             "chaotic"
  where
    phi_inv = 0.6180339887498948482

-- | FFI
foreign import sin :: Number -> Number
foreign import cos :: Number -> Number
foreign import sqrt :: Number -> Number
foreign import atan2 :: Number -> Number -> Number
foreign import toNumber :: Int -> Number
