-- | PROTO-ID-004 — Compile-Time Affinity Proofs
-- Ring affinity constraints are expressed as propositions.
-- A task can only be dispatched to a protocol if a proof of affinity
-- compatibility is provided — checked entirely at compile time.
module Organism.Protocols.AffinityProof

import Organism.Protocol
import Organism.Constants

%default total

||| Proof that two ring affinities are compatible (distance ≤ threshold).
public export
data Compatible : RingAffinity -> RingAffinity -> Type where
  SameRing   : Compatible r r
  AdjacentRing : {a : RingAffinity} -> {b : RingAffinity}
              -> (ringOrd a `minus` ringOrd b <= 2 = True)
              -> Compatible a b

||| A dispatch ticket: task + protocol, with a proof of ring compatibility.
public export
record Dispatch (taskRing : RingAffinity) (protoRing : RingAffinity) where
  constructor MkDispatch
  taskPayload   : String
  protoName     : String
  compatibility : Compatible taskRing protoRing

||| Same-ring dispatch is always trivially provable.
export
selfDispatch : String -> String -> (r : RingAffinity) -> Dispatch r r
selfDispatch task proto r = MkDispatch task proto SameRing

||| Extract the protocol name from a dispatch ticket.
export
dispatchTarget : Dispatch tr pr -> String
dispatchTarget d = protoName d

||| Score a dispatch by its ring affinity (used for routing priority).
export
dispatchScore : Dispatch tr pr -> Double
dispatchScore (MkDispatch _ _ SameRing)        = 1.0
dispatchScore (MkDispatch _ _ (AdjacentRing _)) = phiInv

||| Proof that SameRing dispatches have maximum affinity score.
export
sameRingMaxScore : (d : Dispatch r r) -> dispatchScore d = 1.0
sameRingMaxScore (MkDispatch _ _ SameRing) = Refl
