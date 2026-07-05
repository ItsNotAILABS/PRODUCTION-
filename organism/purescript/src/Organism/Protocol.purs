-- | Protocol base types — PureScript.
-- Types mirror the Haskell Protocol module but use PureScript idioms.
-- Intended as the JS-bridge layer for agents running on Cloudflare Workers.
module Organism.Protocol
  ( ProtocolId(..), RingAffinity(..), ProtocolSpec
  , mkProtocolSpec, specId, specName, specRing, specCapabilities
  , ringOrd, ringAffinity, validate, ProtocolError(..)
  ) where

import Prelude
import Data.Array (null, elem) as Array
import Data.Maybe (Maybe(..))
import Organism.Constants (phi, phiInv)

-- | Opaque protocol identifier
newtype ProtocolId = ProtocolId String

derive instance Eq ProtocolId
derive instance Ord ProtocolId

instance Show ProtocolId where
  show (ProtocolId s) = "ProtocolId(" <> s <> ")"

unProtocolId :: ProtocolId -> String
unProtocolId (ProtocolId s) = s

-- | Ring affinity
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

derive instance Eq RingAffinity
derive instance Ord RingAffinity

instance Show RingAffinity where
  show InterfaceRing    = "InterfaceRing"
  show MemoryRing       = "MemoryRing"
  show RouteRing        = "RouteRing"
  show SovereignRing    = "SovereignRing"
  show SovereignEdgeRing= "SovereignEdgeRing"
  show CognitiveRing    = "CognitiveRing"
  show AffectiveRing    = "AffectiveRing"
  show SomaticRing      = "SomaticRing"
  show NeuralRing       = "NeuralRing"
  show QuantumRing      = "QuantumRing"
  show TemporalRing     = "TemporalRing"

ringOrd :: RingAffinity -> Int
ringOrd InterfaceRing     = 0
ringOrd MemoryRing        = 1
ringOrd RouteRing         = 2
ringOrd SovereignRing     = 3
ringOrd SovereignEdgeRing = 4
ringOrd CognitiveRing     = 5
ringOrd AffectiveRing     = 6
ringOrd SomaticRing       = 7
ringOrd NeuralRing        = 8
ringOrd QuantumRing       = 9
ringOrd TemporalRing      = 10

ringAffinity :: RingAffinity -> RingAffinity -> Number
ringAffinity a b =
  let d = abs (ringOrd a - ringOrd b)
  in phi `pow` (negate (toNumber d))
  where
    pow :: Number -> Number -> Number
    pow base exp = unsafeCoerce (foreign_pow base exp)
    foreign foreign_pow :: Number -> Number -> Number
    toNumber :: Int -> Number
    toNumber = foreign_toNumber
    foreign foreign_toNumber :: Int -> Number

-- | Protocol specification record
type ProtocolSpec =
  { id           :: ProtocolId
  , name         :: String
  , ring         :: RingAffinity
  , capabilities :: Array String
  , engines      :: Array String
  }

specId           :: ProtocolSpec -> ProtocolId
specId s = s.id
specName         :: ProtocolSpec -> String
specName s = s.name
specRing         :: ProtocolSpec -> RingAffinity
specRing s = s.ring
specCapabilities :: ProtocolSpec -> Array String
specCapabilities s = s.capabilities

mkProtocolSpec :: String -> String -> RingAffinity -> Array String -> ProtocolSpec
mkProtocolSpec pid name ring caps =
  { id: ProtocolId pid, name, ring, capabilities: caps, engines: [] }

-- | Validation errors
data ProtocolError
  = EmptyId
  | EmptyName
  | NoCapabilities
  | InvalidRing String

derive instance Eq ProtocolError
instance Show ProtocolError where
  show EmptyId           = "EmptyId"
  show EmptyName         = "EmptyName"
  show NoCapabilities    = "NoCapabilities"
  show (InvalidRing r)   = "InvalidRing(" <> r <> ")"

-- | Validate a protocol spec
validate :: ProtocolSpec -> Either ProtocolError ProtocolSpec
validate s
  | unProtocolId s.id == "" = Left EmptyId
  | s.name == ""            = Left EmptyName
  | Array.null s.capabilities = Left NoCapabilities
  | otherwise               = Right s
