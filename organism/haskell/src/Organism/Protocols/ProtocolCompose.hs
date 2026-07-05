-- | PROTO-HS-002 — Protocol Composition (Monoid)
-- Protocols form a monoid under sequential composition. The empty protocol
-- is the identity (pass-through). Composed protocols chain their capabilities
-- and inherit the highest-priority ring from either component.
module Organism.Protocols.ProtocolCompose
  ( ComposedProtocol(..), emptyProtocol, composeP, mconcat', pipeline
  ) where

import Data.List (nub, minimumBy)
import Data.Ord  (comparing)
import Organism.Protocol (ProtocolSpec(..), ProtocolId(..), RingAffinity(..))

-- | A composed protocol — the result of chaining 0..N protocol specs.
data ComposedProtocol = ComposedProtocol
  { compSpecs        :: [ProtocolSpec]   -- ^ constituent specs, in order
  , compCapabilities :: [String]
  , compRing         :: RingAffinity
  } deriving (Show)

-- | Identity element: the pass-through protocol.
emptyProtocol :: ComposedProtocol
emptyProtocol = ComposedProtocol [] [] InterfaceRing

-- | Sequential composition: run a then b. Monoid (<>).
composeP :: ComposedProtocol -> ComposedProtocol -> ComposedProtocol
composeP a b = ComposedProtocol
  { compSpecs        = compSpecs a <> compSpecs b
  , compCapabilities = nub (compCapabilities a <> compCapabilities b)
  , compRing         = minimumBy (comparing fromEnum) [compRing a, compRing b]
  }

-- | Lift a single ProtocolSpec into ComposedProtocol.
liftSpec :: ProtocolSpec -> ComposedProtocol
liftSpec s = ComposedProtocol [s] (specCapabilities s) (specRing s)

instance Semigroup ComposedProtocol where (<>) = composeP
instance Monoid    ComposedProtocol where mempty = emptyProtocol

-- | Fold a list of specs into a single composed protocol.
mconcat' :: [ProtocolSpec] -> ComposedProtocol
mconcat' = foldr (composeP . liftSpec) emptyProtocol

-- | Build a sequential pipeline of named stages.
pipeline :: [(String, [String], RingAffinity)] -> ComposedProtocol
pipeline stages = mconcat'
  [ ProtocolSpec
      { specId           = ProtocolId name
      , specName         = name
      , specRing         = r
      , specCapabilities = caps
      , specEngines      = []
      }
  | (name, caps, r) <- stages ]
