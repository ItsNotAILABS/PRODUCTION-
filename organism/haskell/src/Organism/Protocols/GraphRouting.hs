-- | PROTO-HS-007 — Graph-Based Protocol Routing
-- Protocols form a directed weighted graph. Edges carry phi-decay scores.
-- Shortest-path (Dijkstra over 1/score) finds optimal routing sequences.
-- Cycles are safe — we cap search depth at node count.
module Organism.Protocols.GraphRouting
  ( RouteGraph, Edge(..), mkGraph, addEdge, shortestPath
  , reachable, topologicalOrder, phiWeightedPath
  ) where

import Data.List  (minimumBy, nub, (\\))
import Data.Ord   (comparing)
import Data.Maybe (mapMaybe)
import Organism.Constants (phi)
import Organism.Protocol  (ProtocolId(..))

data Edge = Edge
  { edgeFrom  :: ProtocolId
  , edgeTo    :: ProtocolId
  , edgeScore :: Double      -- ^ phi-decay score ∈ (0, 1]
  } deriving (Show, Eq)

-- | Adjacency-list graph: each node maps to its outgoing edges.
newtype RouteGraph = RouteGraph { edges :: [Edge] } deriving (Show)

mkGraph :: RouteGraph
mkGraph = RouteGraph []

addEdge :: Edge -> RouteGraph -> RouteGraph
addEdge e (RouteGraph es) = RouteGraph (e : es)

-- | Outgoing edges from a node.
outgoing :: RouteGraph -> ProtocolId -> [Edge]
outgoing (RouteGraph es) pid = filter ((== pid) . edgeFrom) es

-- | All nodes in the graph.
allNodes :: RouteGraph -> [ProtocolId]
allNodes (RouteGraph es) = nub $ concatMap (\e -> [edgeFrom e, edgeTo e]) es

-- | Dijkstra shortest path from src to dst.
-- Cost = 1 / edgeScore (higher score = lower cost = preferred).
shortestPath :: RouteGraph -> ProtocolId -> ProtocolId -> Maybe [ProtocolId]
shortestPath g src dst
  | src == dst = Just [src]
  | otherwise  = go [(0.0, src, [src])] []
  where
    go [] _visited = Nothing
    go queue visited =
      let (cost, node, path) = minimumBy (comparing (\(c,_,_) -> c)) queue
          rest               = filter (\(_,n,_) -> n /= node) queue
      in  if node `elem` visited
          then go rest visited
          else if node == dst
               then Just (reverse path)
               else
                let visited' = node : visited
                    nexts    = [ (cost + 1.0 / edgeScore e, edgeTo e, edgeTo e : path)
                               | e <- outgoing g node
                               , edgeTo e `notElem` visited'
                               ]
                in  go (rest ++ nexts) visited'

-- | All nodes reachable from src via BFS.
reachable :: RouteGraph -> ProtocolId -> [ProtocolId]
reachable g src = go [src] []
  where
    go []     visited = visited
    go (n:ns) visited
      | n `elem` visited = go ns visited
      | otherwise        =
          let nexts = map edgeTo (outgoing g n)
          in  go (ns ++ nexts) (n : visited)

-- | Attempt a topological sort (Kahn's algorithm).
-- Returns Left with cycle node if the graph has a cycle.
topologicalOrder :: RouteGraph -> Either ProtocolId [ProtocolId]
topologicalOrder g =
  let nodes = allNodes g
      inDeg n = length [ e | e <- edges g, edgeTo e == n ]
      go sorted remaining =
        case filter ((== 0) . inDeg) remaining of
          [] -> if null remaining then Right (reverse sorted)
                else Left (head remaining)
          (n:_) ->
            let g' = RouteGraph (filter ((/= n) . edgeFrom) (edges g))
            in  go (n : sorted) (remaining \\ [n])
  in  go [] nodes

-- | Score of a path = product of edge scores, phi-weighted by hop count.
phiWeightedPath :: RouteGraph -> [ProtocolId] -> Double
phiWeightedPath _ [] = 0.0
phiWeightedPath _ [_] = 1.0
phiWeightedPath g path =
  let pairs  = zip path (tail path)
      scores = mapMaybe (lookupScore g) pairs
      n      = fromIntegral (length scores)
  in  product scores ** (1.0 / (phi * n))
  where
    lookupScore gr (a, b) =
      case filter (\e -> edgeFrom e == a && edgeTo e == b) (edges gr) of
        (e:_) -> Just (edgeScore e)
        []    -> Nothing
