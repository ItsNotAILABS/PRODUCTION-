-- | PROTO-HS-003 — Intelligence Pipeline
-- Kleisli-composition-based intelligence processing chain.
-- Each stage is a function (a -> Either Error b), composable with (>=>).
-- The pipeline short-circuits on first failure — correct-by-construction
-- error handling with no exceptions.
module Organism.Protocols.IntelligencePipeline
  ( Stage, Pipeline, mkPipeline, runPipeline
  , validateStage, routeStage, synthesiseStage, respondStage
  ) where

import Control.Monad ((>=>))

type Error = String

-- | A pipeline stage: pure function from input to Either error output.
type Stage a b = a -> Either Error b

-- | A pipeline is the Kleisli composition of its stages.
newtype Pipeline a b = Pipeline { runPipeline :: Stage a b }

-- | Compose two stages sequentially. Fails fast on Left.
mkPipeline :: Stage a b -> Stage b c -> Pipeline a c
mkPipeline f g = Pipeline (f >=> g)

-- | Compose pipeline with an additional stage.
andThen :: Pipeline a b -> Stage b c -> Pipeline a c
andThen (Pipeline f) g = Pipeline (f >=> g)

infixl 1 `andThen`

-- ── Standard organism pipeline stages ────────────────────────────────────────

-- | Validate that an input is non-empty and well-formed.
validateStage :: Stage String String
validateStage s
  | null s    = Left "Empty input"
  | length s > 65536 = Left "Input exceeds 64K limit"
  | otherwise = Right s

-- | Route: tag the input with the best ring affinity keyword.
routeStage :: Stage String (String, String)
routeStage s =
  let ring
        | "memory" `elem` words s   = "MemoryRing"
        | "deploy" `elem` words s   = "SovereignRing"
        | "route"  `elem` words s   = "InterfaceRing"
        | otherwise                  = "InterfaceRing"
  in Right (s, ring)

-- | Synthesise: combine routed input into a structured payload.
synthesiseStage :: Stage (String, String) [(String, String)]
synthesiseStage (s, ring) = Right [("input", s), ("ring", ring), ("status", "synthesised")]

-- | Respond: produce final output string from structured payload.
respondStage :: Stage [(String, String)] String
respondStage pairs =
  case lookup "status" pairs of
    Nothing -> Left "Missing status in payload"
    Just st -> Right (unlines [ k <> ": " <> v | (k, v) <- pairs ])

-- | The default full organism pipeline.
defaultPipeline :: Pipeline String String
defaultPipeline =
  mkPipeline validateStage routeStage
    `andThen` synthesiseStage
    `andThen` respondStage
