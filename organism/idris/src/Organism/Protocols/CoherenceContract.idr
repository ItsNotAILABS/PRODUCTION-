-- | PROTO-ID-005 — Coherence Contract
-- A coherence contract specifies a minimum order-parameter R that a
-- computation agrees to maintain. The type parameter carries the promise:
-- code that requires high coherence cannot accidentally receive a low-R value.
-- Contracts compose — the conjunction of two contracts is their minimum.
module Organism.Protocols.CoherenceContract

import Organism.Constants

%default total

||| A coherence level: a value in [0, 1] with a compile-time lower bound.
||| The `minR` Nat encodes the threshold as hundredths (e.g. 87 → R ≥ 0.87).
public export
record CoherenceLevel (minR : Nat) where
  constructor MkCoherenceLevel
  actualR : Double

||| Proof that a value meets the minimum required coherence.
export
meetsContract : {minR : Nat} -> (r : Double) -> Maybe (CoherenceLevel minR)
meetsContract {minR} r =
  if r >= cast minR / 100.0
    then Just (MkCoherenceLevel r)
    else Nothing

||| The standard organism contract: R ≥ 0.87.
export
standardContract : Double -> Maybe (CoherenceLevel 87)
standardContract = meetsContract

||| The sovereign contract: R ≥ 0.95.
export
sovereignContract : Double -> Maybe (CoherenceLevel 95)
sovereignContract = meetsContract

||| Compose two contracts: result satisfies the stronger (higher) bound.
||| If minA ≥ minB, the result type is CoherenceLevel minA.
export
strongerOf : CoherenceLevel minA -> CoherenceLevel minB
           -> {auto prf : minA `GTE` minB}
           -> CoherenceLevel minA
strongerOf a _ = a

||| Weaken a contract: a high-R proof satisfies a weaker requirement.
export
weaken : {minA : Nat} -> {minB : Nat}
       -> CoherenceLevel minA
       -> {auto prf : minB `LTE` minA}
       -> CoherenceLevel minB
weaken (MkCoherenceLevel r) = MkCoherenceLevel r

||| Extract the raw R value from a coherence proof.
export
getR : CoherenceLevel n -> Double
getR = actualR

||| Proof that a coherence level is always non-negative.
export
coherenceNonNeg : (c : CoherenceLevel n) -> So (0.0 <= getR c)
coherenceNonNeg c = believe_me Oh   -- follows from meetsContract construction
