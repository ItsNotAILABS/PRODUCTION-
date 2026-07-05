-- | PROTO-PS-003 — Cloudflare Worker Deployment Protocol
-- PureScript compiles to JavaScript natively, making it the ideal
-- bridge between the typed organism core and Cloudflare Workers.
-- This module generates type-safe Wrangler configurations and
-- validates deployment targets before dispatch.
module Organism.Protocols.WorkerDeploy
  ( WorkerTarget(..), DeployConfig, DeployError(..)
  , mkDeployConfig, validate, toWranglerToml, toIcpJson
  , estimateCost, deployPriority
  ) where

import Prelude
import Data.Either (Either(..))
import Data.Array (null, intercalate) as Array
import Organism.Constants (phi, phiInv)
import Organism.Protocol (ProtocolId(..), RingAffinity(..))

-- | Deployment targets
data WorkerTarget
  = CloudflareWorker { accountId :: String, scriptName :: String }
  | ICPCanister      { canisterId :: String, dfxNetwork :: String }
  | EdgeFunction     { provider :: String, region :: String }

-- | Deployment configuration
type DeployConfig =
  { protocolId  :: ProtocolId
  , target      :: WorkerTarget
  , ring        :: RingAffinity
  , capabilities :: Array String
  , phiScore    :: Number
  , cronSchedule :: Maybe String
  }

-- | Deployment errors
data DeployError
  = MissingAccountId
  | MissingScriptName
  | MissingCanisterId
  | NoCapabilities
  | InvalidPhiScore

derive instance Eq DeployError
instance Show DeployError where
  show MissingAccountId  = "MissingAccountId"
  show MissingScriptName = "MissingScriptName"
  show MissingCanisterId = "MissingCanisterId"
  show NoCapabilities    = "NoCapabilities"
  show InvalidPhiScore   = "InvalidPhiScore"

-- | Construct a deploy config with defaults.
mkDeployConfig :: ProtocolId -> WorkerTarget -> RingAffinity -> Array String -> DeployConfig
mkDeployConfig pid target ring caps =
  { protocolId: pid
  , target
  , ring
  , capabilities: caps
  , phiScore: 1.0
  , cronSchedule: Nothing
  }

-- | Validate a deploy config.
validate :: DeployConfig -> Either DeployError DeployConfig
validate cfg
  | Array.null cfg.capabilities     = Left NoCapabilities
  | cfg.phiScore < 0.0              = Left InvalidPhiScore
  | otherwise = case cfg.target of
      CloudflareWorker w ->
        if w.accountId == "" then Left MissingAccountId
        else if w.scriptName == "" then Left MissingScriptName
        else Right cfg
      ICPCanister c ->
        if c.canisterId == "" then Left MissingCanisterId
        else Right cfg
      EdgeFunction _ -> Right cfg

-- | Render a wrangler.toml snippet for Cloudflare deployment.
toWranglerToml :: DeployConfig -> String
toWranglerToml cfg =
  case cfg.target of
    CloudflareWorker w ->
      Array.intercalate "\n"
        [ "name = \"" <> w.scriptName <> "\""
        , "main = \"dist/worker.js\""
        , "compatibility_date = \"2024-01-01\""
        , "account_id = \"" <> w.accountId <> "\""
        , ""
        , "[vars]"
        , "PROTOCOL_ID = \"" <> showId cfg.protocolId <> "\""
        , "RING = \"" <> show cfg.ring <> "\""
        , "PHI_SCORE = \"" <> show cfg.phiScore <> "\""
        ]
    _ -> "# Not a Cloudflare Worker target"
  where
    showId (ProtocolId s) = s

-- | Render a dfx.json canister entry for ICP deployment.
toIcpJson :: DeployConfig -> String
toIcpJson cfg =
  case cfg.target of
    ICPCanister c ->
      "{ \"" <> c.canisterId <> "\": { \"type\": \"motoko\", \"main\": \"src/main.mo\" } }"
    _ -> "{}"

-- | Estimate monthly cost in USD based on target type and phi-score.
estimateCost :: DeployConfig -> Number
estimateCost cfg =
  let base = case cfg.target of
        CloudflareWorker _ -> 5.0
        ICPCanister _      -> 2.0
        EdgeFunction _     -> 8.0
  in base * cfg.phiScore

-- | Deployment priority: sovereign ring gets highest priority.
deployPriority :: DeployConfig -> Int
deployPriority cfg = case cfg.ring of
  SovereignRing     -> 0
  SovereignEdgeRing -> 1
  CognitiveRing     -> 2
  NeuralRing        -> 3
  _                 -> 9
