-- | PROTO-PS-002 — Phi-Decay Score Streams (PureScript / JS)
-- Lazy infinite streams implemented via a coin-drop function.
-- PureScript's Effect + lazy thunks give the same semantics as
-- Haskell's lazy lists, but compile to idiomatic JavaScript.
module Organism.Protocols.PhiStream
  ( Stream, scoreStream, takeStream, dropStream
  , bestAtIndex, decayToThreshold, phiGeometric
  ) where

import Prelude
import Data.Array (range, length, (!!)) as Array
import Data.Maybe (Maybe(..), fromMaybe)
import Organism.Constants (phi, phiInv, heartbeatS)

-- | A stream is a function from index to value (lazy by JS call semantics).
newtype Stream a = Stream (Int -> a)

-- | Evaluate stream at a given index.
evalAt :: forall a. Stream a -> Int -> a
evalAt (Stream f) = f

-- | Infinite phi-decay score stream.
-- scoreAt n = initial * 0.5^(n * heartbeatS / halfLifeS)
scoreStream :: Number -> Number -> Stream Number
scoreStream initial halfLifeS = Stream \n ->
  let t = toNumber n * heartbeatS
  in initial * (0.5 `pow` (t / halfLifeS))

-- | Take the first n values from a stream.
takeStream :: forall a. Int -> Stream a -> Array a
takeStream n (Stream f) = map f (Array.range 0 (n - 1))

-- | Drop the first n values (shift index offset).
dropStream :: forall a. Int -> Stream a -> Stream a
dropStream offset (Stream f) = Stream \i -> f (i + offset)

-- | Find the stream with the highest value at index t.
bestAtIndex :: Array { id :: String, stream :: Stream Number } -> Int -> { id :: String, value :: Number }
bestAtIndex streams t =
  let scored = map (\s -> { id: s.id, value: evalAt s.stream t }) streams
      best   = foldl1 (\a b -> if a.value >= b.value then a else b) scored
  in fromMaybe { id: "", value: 0.0 } best
  where
    foldl1 :: forall a. (a -> a -> a) -> Array a -> Maybe a
    foldl1 f arr = case Array.length arr of
      0 -> Nothing
      _ -> Just (foldl f (unsafeIndex arr 0) (sliceFrom 1 arr))
    unsafeIndex :: forall a. Array a -> Int -> a
    unsafeIndex arr i = fromMaybe (unsafeCoerce unit) (arr Array.!! i)
    sliceFrom :: forall a. Int -> Array a -> Array a
    sliceFrom n arr = map (\i -> unsafeIndex arr i) (Array.range n (Array.length arr - 1))

-- | Find the first index at which the stream falls below threshold.
-- Checks indices 0..limit-1; returns Nothing if never crossed.
decayToThreshold :: Stream Number -> Number -> Int -> Maybe Int
decayToThreshold stream threshold limit =
  let indices = Array.range 0 (limit - 1)
      crosses = filter (\i -> evalAt stream i < threshold) indices
  in case crosses of
       [] -> Nothing
       (i:_) -> Just i
  where
    filter :: forall a. (a -> Boolean) -> Array a -> Array a
    filter p = foldl (\acc x -> if p x then acc <> [x] else acc) []

-- | Geometric series of phi powers: [φ⁰, φ¹, φ², ..., φⁿ⁻¹].
phiGeometric :: Int -> Array Number
phiGeometric n = map (\i -> phi `pow` toNumber i) (Array.range 0 (n - 1))

-- | FFI helpers
foreign import pow :: Number -> Number -> Number
foreign import toNumber :: Int -> Number
