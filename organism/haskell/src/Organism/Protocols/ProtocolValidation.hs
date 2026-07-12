-- | PROTO-HS-006 — Protocol Validation (Either Monad)
-- All protocol inputs are validated through a chain of Either-based checks.
-- No exceptions. No partial functions. Failures carry typed error messages.
-- Compose validators with (>=>) for fail-fast pipelines.
module Organism.Protocols.ProtocolValidation
  ( ValidationError(..), Validator
  , nonEmpty, maxLength, matchesRing, hasCapability
  , validateProtocolSpec, runValidation, allOf
  ) where

import Control.Monad ((>=>))
import Organism.Protocol  (ProtocolSpec(..), ProtocolId(..), RingAffinity)

data ValidationError
  = EmptyField String
  | FieldTooLong String Int Int   -- field, max, actual
  | RingMismatch RingAffinity RingAffinity
  | MissingCapability String
  | CompositeError [ValidationError]
  deriving (Show, Eq)

type Validator a = a -> Either ValidationError a

-- | Fail if the string is empty.
nonEmpty :: String -> Validator String
nonEmpty field s
  | null s    = Left (EmptyField field)
  | otherwise = Right s

-- | Fail if the string exceeds maxLen characters.
maxLength :: String -> Int -> Validator String
maxLength field maxLen s
  | length s > maxLen = Left (FieldTooLong field maxLen (length s))
  | otherwise         = Right s

-- | Fail if ring does not match expected.
matchesRing :: RingAffinity -> Validator ProtocolSpec
matchesRing expected spec
  | specRing spec == expected = Right spec
  | otherwise                 = Left (RingMismatch expected (specRing spec))

-- | Fail if spec lacks the required capability.
hasCapability :: String -> Validator ProtocolSpec
hasCapability cap spec
  | cap `elem` specCapabilities spec = Right spec
  | otherwise                        = Left (MissingCapability cap)

-- | Validate a full ProtocolSpec — id, name, and at least one capability.
validateProtocolSpec :: Validator ProtocolSpec
validateProtocolSpec spec = do
  _ <- nonEmpty "protocol_id" (unProtocolId (specId spec))
  _ <- nonEmpty "name"        (specName spec)
  if null (specCapabilities spec)
    then Left (EmptyField "capabilities")
    else Right spec

-- | Run a validator and convert to a simple Bool.
runValidation :: Validator a -> a -> Bool
runValidation v x = case v x of { Right _ -> True; Left _ -> False }

-- | Combine multiple validators — fail with CompositeError listing all failures.
allOf :: [Validator a] -> Validator a
allOf vs x =
  let results = map (`runValidation` x) vs
      errors  = [ e | (v, False) <- zip vs results
                    , Left e <- [v x] ]
  in  if null errors then Right x
      else Left (CompositeError errors)
