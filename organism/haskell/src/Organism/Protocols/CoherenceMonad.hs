-- | PROTO-HS-009 — Coherence Monad
-- A state monad threading Kuramoto coherence state through computations.
-- Every bind step re-measures R and short-circuits if coherence falls below
-- the phi-derived threshold (1/φ² ≈ 0.382).
module Organism.Protocols.CoherenceMonad
  ( CoherenceState(..), Coherence, runCoherence, evalCoherence
  , getCoherence, putPhases, stepCoherence, requireCoherence
  , liftCoherence, coherenceThreshold
  ) where

import Control.Monad (when)
import Organism.Constants (phi, phiInv, heartbeatS, coherenceTarget)
import Organism.Physics   (orderParameter, meanFieldStep)

data CoherenceState = CoherenceState
  { csPhases    :: [Double]   -- ^ oscillator phases (radians)
  , csActivity  :: [Double]   -- ^ per-node activity weights
  , csCoupling  :: Double     -- ^ global coupling K
  , csR         :: Double     -- ^ current order parameter
  , csPsi       :: Double     -- ^ current mean phase
  , csBeat      :: Int        -- ^ heartbeat counter
  } deriving (Show, Eq)

-- | Coherence monad: Either (coherence failure reason) (a, new state).
newtype Coherence a = Coherence
  { runCoherence :: CoherenceState -> Either String (a, CoherenceState) }

instance Functor Coherence where
  fmap f (Coherence g) = Coherence $ \s -> fmap (\(a, s') -> (f a, s')) (g s)

instance Applicative Coherence where
  pure x = Coherence $ \s -> Right (x, s)
  (Coherence f) <*> (Coherence x) = Coherence $ \s ->
    case f s of
      Left err        -> Left err
      Right (fn, s')  ->
        case x s' of
          Left err'       -> Left err'
          Right (v, s'')  -> Right (fn v, s'')

instance Monad Coherence where
  return = pure
  (Coherence x) >>= f = Coherence $ \s ->
    case x s of
      Left err       -> Left err
      Right (a, s')  -> runCoherence (f a) s'

-- | Run and discard the final state, returning only the value.
evalCoherence :: Coherence a -> CoherenceState -> Either String a
evalCoherence m s = fmap fst (runCoherence m s)

-- | Below this R value a computation is considered incoherent.
coherenceThreshold :: Double
coherenceThreshold = phiInv * phiInv   -- 1/φ² ≈ 0.382

-- | Read the current (R, ψ) pair.
getCoherence :: Coherence (Double, Double)
getCoherence = Coherence $ \s -> Right ((csR s, csPsi s), s)

-- | Overwrite the phase array and recompute (R, ψ).
putPhases :: [Double] -> Coherence ()
putPhases phases = Coherence $ \s ->
  let (r, psi) = orderParameter phases
  in  Right ((), s { csPhases = phases, csR = r, csPsi = psi })

-- | Advance one heartbeat using the mean-field Kuramoto step.
stepCoherence :: Coherence Double
stepCoherence = Coherence $ \s ->
  let phases' = meanFieldStep (csPhases s) (csActivity s) (csCoupling s) heartbeatS
      (r, psi) = orderParameter phases'
  in  Right (r, s { csPhases = phases', csR = r, csPsi = psi
                  , csBeat = csBeat s + 1 })

-- | Fail the computation if R is below the coherence threshold.
requireCoherence :: Coherence ()
requireCoherence = Coherence $ \s ->
  if csR s >= coherenceThreshold
    then Right ((), s)
    else Left ("Coherence below threshold: R=" ++ show (csR s)
               ++ " < " ++ show coherenceThreshold)

-- | Lift a pure function over the state into Coherence.
liftCoherence :: (CoherenceState -> (a, CoherenceState)) -> Coherence a
liftCoherence f = Coherence $ \s -> Right (f s)
