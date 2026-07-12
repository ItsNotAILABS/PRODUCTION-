-- | PROTO-HS-005 — Lazy Phi-Decay Score Streams
-- Haskell's lazy evaluation makes infinite phi-decay score streams natural.
-- A protocol's score over time is an infinite list of decaying values.
-- We only evaluate as many terms as needed — the rest stay un-evaluated.
module Organism.Protocols.LazyScoring
  ( scoreStream, takeAtTimes, bestAtTime, decayToTarget
  ) where

import Organism.Constants (phi, goldenAngleDeg)

-- | Infinite stream of scores decaying from `initial` with the given half-life.
-- Each term is the score at beat n (time = n * heartbeatS).
scoreStream :: Double -> Double -> Double -> [Double]
scoreStream initial halfLifeS heartbeatS_ =
  let decay n = initial * 0.5 ** (fromIntegral n * heartbeatS_ / halfLifeS)
  in  map decay [0 ..]

-- | Score values at specific beat numbers.
takeAtTimes :: [Double] -> [Int] -> [Double]
takeAtTimes stream beats = map (stream !!) beats

-- | Given several (id, stream) pairs, return the id with the highest score at beat t.
bestAtTime :: [(String, [Double])] -> Int -> (String, Double)
bestAtTime streams t =
  let scored = [ (sid, s !! t) | (sid, s) <- streams ]
  in  foldr1 (\a b -> if snd a >= snd b then a else b) scored

-- | Find the first beat at which a stream decays below `threshold`.
-- Returns Nothing if the stream never drops below (e.g., threshold ≤ 0).
decayToTarget :: [Double] -> Double -> Maybe Int
decayToTarget stream threshold =
  case [ n | (n, v) <- zip [0..] (take 10000 stream), v < threshold ] of
    []    -> Nothing
    (n:_) -> Just n
