-- | PROTO-HS-001 — Phi-Weighted Routing
-- Pure functional protocol that routes any intelligence task using
-- phi-exponential preference weights. Stateless — same input always
-- yields same route (referential transparency).
module Organism.Protocols.PhiRouting
  ( PhiRouter(..), mkPhiRouter, phiRoute, scoreTask
  ) where

import Data.List (maximumBy)
import Data.Ord  (comparing)
import Organism.Constants (phi, phiInv)

data PhiRouter = PhiRouter
  { routerProtocols :: [(String, [String], String)]
    -- ^ (protocol_id, capabilities, ring)
  , routerWeights   :: [(String, Double)]
    -- ^ (protocol_id, adaptive_weight)
  } deriving (Show)

mkPhiRouter :: [(String, [String], String)] -> PhiRouter
mkPhiRouter protos =
  let n = fromIntegral (length protos)
      weights = [ (pid, phi ** (-(fromIntegral i) / n))
                | (i, (pid, _, _)) <- zip [0..] protos ]
  in  PhiRouter protos weights

scoreTask :: PhiRouter -> String -> [String] -> String -> Double
scoreTask router kw caps ring_ =
  case filter (\(pid,_,_) -> pid == kw) (routerProtocols router) of
    _ -> let base = maybe 1.0 id (lookup kw (routerWeights router))
             capBonus  = fromIntegral (length (filter (`elem` caps) (concatMap snd3 (routerProtocols router)))) * phi
             ringBonus = fromIntegral (length (filter (\(_,_,r) -> r == ring_) (routerProtocols router))) * phi
         in  base + capBonus + ringBonus
  where snd3 (_,x,_) = x

phiRoute :: PhiRouter -> String -> [(String, Double)]
phiRoute router query =
  let scored = [ (pid, w * overlap)
               | (pid, caps, _) <- routerProtocols router
               , let overlap = 1.0 + fromIntegral (length (filter (`elem` words query) caps))
               , let w = maybe 1.0 id (lookup pid (routerWeights router))
               ]
  in  reverse (map fst3_pair (take 5 (iterate id (sortByScore scored))))
  where
    fst3_pair (a,b) = (a, b)
    sortByScore = foldr insert []
    insert x [] = [x]
    insert x (y:ys)
      | snd x >= snd y = x : y : ys
      | otherwise      = y : insert x ys
