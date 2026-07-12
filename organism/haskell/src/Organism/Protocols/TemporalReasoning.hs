-- | PROTO-HS-010 — Temporal Reasoning over Heartbeat Sequences
-- The organism reasons about time in heartbeat units (873 ms each).
-- This module provides: beat arithmetic, windowed aggregation,
-- phi-horizon forecasting, and causal-order enforcement.
module Organism.Protocols.TemporalReasoning
  ( Beat, BeatWindow, beatToSec, secToBeat
  , window, aggregate, phiHorizon
  , Event(..), Timeline, insertEvent, causalOrder, forecastNext
  ) where

import Data.List (sortBy, groupBy)
import Data.Ord  (comparing)
import Organism.Constants (phi, phiInv, heartbeatS, goldenAngleDeg)

-- | Discrete heartbeat index (0-indexed from start of session).
type Beat = Int

-- | A window of consecutive beat indices.
type BeatWindow = (Beat, Beat)   -- ^ (start, end) inclusive

-- | Convert a beat index to wall-clock seconds.
beatToSec :: Beat -> Double
beatToSec b = fromIntegral b * heartbeatS

-- | Convert seconds to the nearest beat index.
secToBeat :: Double -> Beat
secToBeat s = round (s / heartbeatS)

-- | Slide a window of width w beats, centred on beat c.
window :: Beat -> Int -> BeatWindow
window c w = (c - w `div` 2, c + w `div` 2)

-- | Aggregate values within a window using a fold function.
aggregate :: BeatWindow -> [(Beat, Double)] -> (Double -> Double -> Double) -> Double -> Double
aggregate (lo, hi) series f z =
  foldr (\(b, v) acc -> if b >= lo && b <= hi then f acc v else acc) z series

-- | φ-horizon: the number of beats over which a signal's influence decays to 1/φ.
-- Derived from exponential decay: e^(-λ·t) = 1/φ → t = ln(φ)/λ.
-- We use λ = 1/heartbeatS (one beat time constant).
phiHorizon :: Double -> Beat
phiHorizon decayRate =
  let t = log phi / max 1e-9 decayRate
  in  secToBeat t

-- | A timestamped event in the timeline.
data Event a = Event
  { evBeat    :: Beat
  , evPayload :: a
  } deriving (Show, Eq, Ord)

-- | Ordered list of events (sorted ascending by beat).
type Timeline a = [Event a]

-- | Insert an event, maintaining ascending beat order.
insertEvent :: Event a -> Timeline a -> Timeline a
insertEvent e [] = [e]
insertEvent e (x:xs)
  | evBeat e <= evBeat x = e : x : xs
  | otherwise            = x : insertEvent e xs

-- | Check that every event in the timeline respects causal order
-- (no event at beat b2 can cause an event at beat b1 < b2).
-- Returns Left with the violating pair on failure.
causalOrder :: Timeline a -> Either (Beat, Beat) ()
causalOrder []  = Right ()
causalOrder [_] = Right ()
causalOrder (x:y:rest)
  | evBeat x <= evBeat y = causalOrder (y : rest)
  | otherwise            = Left (evBeat x, evBeat y)

-- | Forecast the value at beat (t + horizon) using phi-weighted
-- exponential smoothing over the last `horizon` beats of a series.
forecastNext :: [(Beat, Double)] -> Beat -> Beat -> Double
forecastNext series currentBeat horizon =
  let (lo, hi) = window currentBeat horizon
      inWindow  = filter (\(b, _) -> b >= lo && b <= hi) series
      n         = length inWindow
      weights   = map (\k -> phiInv ** fromIntegral k) [0 .. n - 1]
      vals      = map snd (sortBy (comparing (negate . fst)) inWindow)
      wSum      = sum weights
  in  if wSum == 0 || null vals
        then 0.0
        else sum (zipWith (*) weights vals) / wSum
