-- | Protocol type class — the foundation of the organism's intelligence mesh.
-- Any intelligence behaviour is a Protocol instance.
module Organism.Protocol
  ( Protocol(..), ProtocolId(..), RingAffinity(..)
  , ProtocolSpec(..), validate, compose
  ) where

import Data.List (nub)

-- | Identifier for a protocol.
newtype ProtocolId = ProtocolId { unProtocolId :: String }
  deriving (Show, Eq, Ord)

-- | Ring affinity classifies which layer of the organism a protocol belongs to.
data RingAffinity
  = InterfaceRing
  | TransportRing
  | SovereignRing
  | MemoryRing
  | CounselRing
  | GeometryRing
  | ProofRing
  | PersistenceRing
  | VisualRing
  | BuildRing
  | NativeCapabilityRing
  deriving (Show, Eq, Ord, Enum, Bounded)

-- | A protocol specification — the static description of a protocol.
data ProtocolSpec = ProtocolSpec
  { specId          :: ProtocolId
  , specName        :: String
  , specRing        :: RingAffinity
  , specCapabilities :: [String]
  , specEngines     :: [String]
  } deriving (Show, Eq)

-- | The Protocol type class. Implement this for any intelligence behaviour.
class Protocol p where
  protocolId   :: p -> ProtocolId
  ring         :: p -> RingAffinity
  capabilities :: p -> [String]
  -- | Execute the protocol on an input, producing output in some context f.
  execute      :: Applicative f => p -> String -> f String
  -- | Validate that the protocol is correctly configured.
  isValid      :: p -> Bool
  isValid _ = True  -- Default: always valid; override for strict protocols.

-- | Validate a ProtocolSpec — must have an id, name, and at least one capability.
validate :: ProtocolSpec -> Either String ProtocolSpec
validate spec
  | null (unProtocolId $ specId spec)  = Left "Protocol id is empty"
  | null (specName spec)               = Left "Protocol name is empty"
  | null (specCapabilities spec)       = Left "Protocol has no capabilities"
  | otherwise                          = Right spec

-- | Compose two ProtocolSpecs — the result covers the union of capabilities
-- and inherits the higher-priority ring (lower Enum ordinal = higher priority).
compose :: ProtocolSpec -> ProtocolSpec -> ProtocolSpec
compose a b = ProtocolSpec
  { specId           = ProtocolId (unProtocolId (specId a) <> "+" <> unProtocolId (specId b))
  , specName         = specName a <> " ∘ " <> specName b
  , specRing         = min (specRing a) (specRing b)
  , specCapabilities = nub (specCapabilities a <> specCapabilities b)
  , specEngines      = nub (specEngines a <> specEngines b)
  }
