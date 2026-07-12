-- | Pure functional phi-weighted routing over the protocol mesh.
module Organism.Routing
  ( Task(..), ScoredRoute(..), route, topRoutes, applyFeedback
  , RoutingTable, buildRoutingTable
  ) where

import Data.List (sortBy)
import Data.Ord  (comparing, Down(..))
import Data.Map.Strict (Map)
import qualified Data.Map.Strict as Map
import Organism.Constants (phi, phiInv)
import Organism.Protocol  (ProtocolSpec(..), ProtocolId(..), RingAffinity)

data Task = Task
  { taskKeyword   :: String
  , taskRing      :: Maybe RingAffinity
  , taskCapability :: Maybe String
  } deriving (Show)

data ScoredRoute = ScoredRoute
  { routeSpec  :: ProtocolSpec
  , routeScore :: Double
  } deriving (Show)

-- | Routing table: maps protocol id to (spec, adaptive score).
type RoutingTable = Map ProtocolId (ProtocolSpec, Double)

-- | Build initial routing table from a list of specs.
-- Base score = φ^(-i/n) where i is ordinal position.
buildRoutingTable :: [ProtocolSpec] -> RoutingTable
buildRoutingTable specs =
  let n = fromIntegral (length specs)
      indexed = zip [0..] specs
  in  Map.fromList
        [ (specId s, (s, phi ** (-(fromIntegral i) / n)))
        | (i, s) <- indexed
        ]

-- | Score a single protocol spec against a task.
score :: RoutingTable -> Task -> ProtocolSpec -> Double
score table task spec =
  let base = maybe 1.0 snd (Map.lookup (specId spec) table)
      ringBonus = case taskRing task of
        Just r | r == specRing spec -> phi * phi
        _                           -> 1.0
      capBonus = case taskCapability task of
        Just c | c `elem` specCapabilities spec -> phi
        _                                       -> 1.0
      kwBonus | taskKeyword task `elem` specCapabilities spec = phi
              | otherwise                                     = 1.0
  in  base * ringBonus * capBonus * kwBonus

-- | Find the best-matching protocol for a task.
route :: RoutingTable -> [ProtocolSpec] -> Task -> Maybe ScoredRoute
route _ [] _ = Nothing
route table specs task =
  let scored = [ ScoredRoute s (score table task s) | s <- specs ]
      best   = head (sortBy (comparing (Down . routeScore)) scored)
  in  Just best

-- | Top-n routes for a task.
topRoutes :: RoutingTable -> [ProtocolSpec] -> Task -> Int -> [ScoredRoute]
topRoutes table specs task n =
  take n . sortBy (comparing (Down . routeScore))
  $ [ ScoredRoute s (score table task s) | s <- specs ]

-- | Phi-decay adaptive feedback — updates score in routing table.
applyFeedback :: RoutingTable -> ProtocolId -> Bool -> RoutingTable
applyFeedback table pid success =
  Map.adjust update pid table
  where
    update (spec, s)
      | success   = (spec, min (phi^(3::Int)) (s * phi))
      | otherwise = (spec, max (phi**(-3))    (s * phiInv))
