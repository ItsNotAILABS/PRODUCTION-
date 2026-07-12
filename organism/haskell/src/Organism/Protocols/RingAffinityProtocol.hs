-- | PROTO-HS-008 — Ring Affinity Negotiation
-- Protocols declare ring affinities; tasks declare ring preferences.
-- This module scores protocols by affinity match and negotiates the
-- best ring assignment for a set of concurrent tasks.
module Organism.Protocols.RingAffinityProtocol
  ( AffinityScore, ringDistance, affinityScore
  , negotiate, rankByAffinity, affinityMatrix
  ) where

import Data.List (sortBy, nub)
import Data.Ord  (comparing, Down(..))
import Organism.Protocol (RingAffinity(..), ProtocolSpec(..), ProtocolId(..))
import Organism.Constants (phi)

-- | Scalar affinity in [0,1].
type AffinityScore = Double

-- | Ordinal distance between two rings (lower = closer = better match).
ringDistance :: RingAffinity -> RingAffinity -> Int
ringDistance a b = abs (fromEnum a - fromEnum b)

-- | Convert ring distance to affinity score via phi-decay.
-- distance 0 → 1.0; distance 1 → 1/φ; distance n → φ^(-n).
affinityScore :: RingAffinity -> RingAffinity -> AffinityScore
affinityScore a b =
  let d = fromIntegral (ringDistance a b)
  in  phi ** (negate d)

-- | Rank a list of protocol specs by their affinity to a target ring.
rankByAffinity :: RingAffinity -> [ProtocolSpec] -> [(ProtocolSpec, AffinityScore)]
rankByAffinity target specs =
  sortBy (comparing (Down . snd))
    [ (s, affinityScore target (specRing s)) | s <- specs ]

-- | Negotiate a single ring assignment for a set of competing preferences.
-- Returns the ring whose total affinity sum across all preferences is maximal.
negotiate :: [RingAffinity] -> [RingAffinity] -> RingAffinity
negotiate candidates preferences =
  let score r = sum [ affinityScore p r | p <- preferences ]
      ranked  = sortBy (comparing (Down . score)) candidates
  in  case ranked of
        []    -> InterfaceRing
        (r:_) -> r

-- | Build a full affinity matrix: rows = protocol specs, columns = ring affinities.
-- Result is a list of (protocolId, [(ring, score)]).
affinityMatrix :: [ProtocolSpec] -> [(ProtocolId, [(RingAffinity, AffinityScore)])]
affinityMatrix specs =
  [ ( specId s
    , [ (r, affinityScore (specRing s) r) | r <- allRings ]
    )
  | s <- specs ]
  where
    allRings =
      [ InterfaceRing, MemoryRing, RouteRing, SovereignRing, SovereignEdgeRing
      , CognitiveRing, AffectiveRing, SomaticRing
      , NeuralRing, QuantumRing, TemporalRing
      ]
