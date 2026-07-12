-- | PROTO-PS-005 — Protocol Bridge (PureScript ↔ JS interop)
-- This module provides the typed boundary between the PureScript organism
-- core and the JavaScript runtime (Cloudflare Workers, browser, Node.js).
-- All external calls go through this bridge to preserve type safety.
module Organism.Protocols.ProtocolBridge
  ( BridgeRequest, BridgeResponse, BridgeError(..)
  , mkRequest, dispatch, encodeResponse, decodeRequest
  , toForeign, fromForeign
  ) where

import Prelude
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Organism.Protocol (ProtocolId(..), RingAffinity(..), ProtocolSpec)
import Organism.Constants (phi)

-- | A request coming in from the JS runtime.
type BridgeRequest =
  { requestId   :: String
  , protocolId  :: String
  , ring        :: String
  , payload     :: String
  , phiScore    :: Number
  }

-- | A response going back to the JS runtime.
type BridgeResponse =
  { requestId   :: String
  , success     :: Boolean
  , result      :: String
  , errorCode   :: Maybe String
  , phiScore    :: Number
  }

-- | Bridge errors
data BridgeError
  = UnknownProtocol String
  | UnknownRing String
  | EmptyPayload
  | SerializationError String

derive instance Eq BridgeError
instance Show BridgeError where
  show (UnknownProtocol p)   = "UnknownProtocol: " <> p
  show (UnknownRing r)       = "UnknownRing: " <> r
  show EmptyPayload          = "EmptyPayload"
  show (SerializationError s) = "SerializationError: " <> s

-- | Construct a bridge request.
mkRequest :: String -> String -> String -> String -> BridgeRequest
mkRequest rid pid ring payload =
  { requestId: rid, protocolId: pid, ring, payload, phiScore: 1.0 }

-- | Parse a ring name from a string.
parseRing :: String -> Either BridgeError RingAffinity
parseRing "InterfaceRing"     = Right InterfaceRing
parseRing "MemoryRing"        = Right MemoryRing
parseRing "RouteRing"         = Right RouteRing
parseRing "SovereignRing"     = Right SovereignRing
parseRing "SovereignEdgeRing" = Right SovereignEdgeRing
parseRing "CognitiveRing"     = Right CognitiveRing
parseRing "AffectiveRing"     = Right AffectiveRing
parseRing "SomaticRing"       = Right SomaticRing
parseRing "NeuralRing"        = Right NeuralRing
parseRing "QuantumRing"       = Right QuantumRing
parseRing "TemporalRing"      = Right TemporalRing
parseRing unknown             = Left (UnknownRing unknown)

-- | Validate and decode a raw BridgeRequest.
decodeRequest :: BridgeRequest -> Either BridgeError (ProtocolId, RingAffinity, String)
decodeRequest req
  | req.payload == "" = Left EmptyPayload
  | otherwise = do
      ring <- parseRing req.ring
      let pid = ProtocolId req.protocolId
      pure (pid, ring, req.payload)

-- | Dispatch a validated request — returns a response record.
dispatch :: BridgeRequest -> (ProtocolId -> RingAffinity -> String -> Either String String)
         -> BridgeResponse
dispatch req handler =
  case decodeRequest req of
    Left err ->
      { requestId: req.requestId
      , success: false
      , result: ""
      , errorCode: Just (show err)
      , phiScore: req.phiScore * 0.6180339887498948482
      }
    Right (pid, ring, payload) ->
      case handler pid ring payload of
        Left errMsg ->
          { requestId: req.requestId
          , success: false
          , result: ""
          , errorCode: Just errMsg
          , phiScore: req.phiScore * 0.6180339887498948482
          }
        Right result ->
          { requestId: req.requestId
          , success: true
          , result
          , errorCode: Nothing
          , phiScore: req.phiScore * phi
          }

-- | Serialise a response to a JSON-like string for the JS boundary.
encodeResponse :: BridgeResponse -> String
encodeResponse r =
  "{ \"requestId\": \"" <> r.requestId <> "\""
  <> ", \"success\": " <> show r.success
  <> ", \"result\": \"" <> r.result <> "\""
  <> ", \"phiScore\": " <> show r.phiScore
  <> " }"

-- | Opaque JS foreign value
foreign import data Foreign :: Type

foreign import toForeign   :: forall a. a -> Foreign
foreign import fromForeign :: forall a. Foreign -> Maybe a
