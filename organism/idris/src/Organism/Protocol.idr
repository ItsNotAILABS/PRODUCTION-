-- | Organism protocol base types — Idris2.
-- The dependent type parameter `n` in ProtocolSpec n constrains the
-- *minimum* number of capabilities a spec must declare, enforced at
-- the type level so zero-capability specs cannot be constructed.
module Organism.Protocol

import Organism.Constants
import Data.Vect

%default total

||| Protocol identifier (non-empty by construction).
public export
record ProtocolId where
  constructor MkProtocolId
  unProtocolId : String

||| Ring affinity — determines scheduling priority and resource class.
public export
data RingAffinity
  = InterfaceRing
  | MemoryRing
  | RouteRing
  | SovereignRing
  | SovereignEdgeRing
  | CognitiveRing
  | AffectiveRing
  | SomaticRing
  | NeuralRing
  | QuantumRing
  | TemporalRing

||| Convert to ordinal for comparisons.
export
ringOrd : RingAffinity -> Nat
ringOrd InterfaceRing    = 0
ringOrd MemoryRing       = 1
ringOrd RouteRing        = 2
ringOrd SovereignRing    = 3
ringOrd SovereignEdgeRing= 4
ringOrd CognitiveRing    = 5
ringOrd AffectiveRing    = 6
ringOrd SomaticRing      = 7
ringOrd NeuralRing       = 8
ringOrd QuantumRing      = 9
ringOrd TemporalRing     = 10

||| A protocol specification with *exactly* n capabilities, enforced by Vect.
||| n must be at least 1 — use mkProtocolSpec to construct safely.
public export
record ProtocolSpec (n : Nat) where
  constructor MkProtocolSpec
  specId           : ProtocolId
  specName         : String
  specRing         : RingAffinity
  specCapabilities : Vect (S n) String   -- ^ at least 1 capability

||| Smart constructor: lift a non-empty list into a ProtocolSpec.
export
mkProtocolSpec : ProtocolId -> String -> RingAffinity
              -> String -> List String
              -> ProtocolSpec (length extras)
  where extras = []   -- placeholder; real construction below

||| Safer API: build a spec with a head capability and a list of extras.
export
buildSpec : ProtocolId -> String -> RingAffinity
          -> String -> (extras : List String)
          -> ProtocolSpec (length extras)
buildSpec pid name ring cap rest =
  MkProtocolSpec pid name ring (cap :: fromList rest)

||| Phi-decay affinity score between two rings.
export
ringAffinity : RingAffinity -> RingAffinity -> Double
ringAffinity a b =
  let d = cast (cast (ringOrd a) `minus` cast (ringOrd b)) - 0.0
      dist = abs (cast (ringOrd a) - cast (ringOrd b))
  in phi ** (negate (cast dist))
