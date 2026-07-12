{-# LANGUAGE OverloadedStrings #-}
module TaskLang
  ( ParsedTask (..)
  , parseLine
  ) where

import Data.Aeson (ToJSON (..), object, (.=))
import Data.Char (isDigit)
import Data.Text (Text)
import qualified Data.Text as T

data ParsedTask = ParsedTask
  { ptTitle          :: Text
  , ptDue            :: Maybe Text
  , ptPriority       :: Int
  , ptEstimateMinutes :: Int
  , ptTags           :: [Text]
  , ptDeliverable    :: Maybe Text
  , ptParent         :: Maybe Text
  } deriving (Show, Eq)

instance ToJSON ParsedTask where
  toJSON pt = object
    [ "title"            .= ptTitle pt
    , "due"               .= ptDue pt
    , "priority"          .= ptPriority pt
    , "estimate_minutes"  .= ptEstimateMinutes pt
    , "tags"              .= ptTags pt
    , "deliverable"       .= ptDeliverable pt
    , "parent"            .= ptParent pt
    ]

-- | A single lexed token from the input line: either a recognized directive
-- or a plain word that belongs to the free-text title.
data Token
  = TDue Text
  | TPriority Int
  | TEstimate Int
  | TTag Text
  | TDeliverable Text
  | TParent Text
  | TWord Text
  deriving (Show, Eq)

-- | Recursive-descent classification of the token stream. Each raw
-- whitespace-separated word is examined for one of the directive prefixes;
-- anything left over recurses as plain title text.
lexLine :: Text -> [Token]
lexLine = map classify . T.words
  where
    classify :: Text -> Token
    classify w
      | "due:" `T.isPrefixOf` w = TDue (T.drop 4 w)
      | "!" `T.isPrefixOf` w, Just n <- readPriority (T.drop 1 w) = TPriority n
      | "~" `T.isPrefixOf` w = TEstimate (parseDuration (T.drop 1 w))
      | "#" `T.isPrefixOf` w = TTag (T.drop 1 w)
      | "@deliverable:" `T.isPrefixOf` w = TDeliverable (T.drop (T.length "@deliverable:") w)
      | "^parent:" `T.isPrefixOf` w = TParent (T.drop (T.length "^parent:") w)
      | otherwise = TWord w

    readPriority :: Text -> Maybe Int
    readPriority t = case T.unpack t of
      [c] | isDigit c, c >= '1', c <= '5' -> Just (read [c])
      _ -> Nothing

-- | Duration grammar: raw integer minutes, or a Nh Nm combination (either
-- part optional, e.g. "1h30m", "2h", "45m").
parseDuration :: Text -> Int
parseDuration t
  | T.all isDigit t && not (T.null t) = read (T.unpack t)
  | otherwise = hours * 60 + minutes
  where
    (hoursPart, afterH) = T.breakOn "h" t
    hours
      | T.null afterH = 0
      | T.all isDigit hoursPart && not (T.null hoursPart) = read (T.unpack hoursPart)
      | otherwise = 0
    remainder = if T.null afterH then t else T.drop 1 afterH
    (minsPart, afterM) = T.breakOn "m" remainder
    minutes
      | T.null afterM = 0
      | T.all isDigit minsPart && not (T.null minsPart) = read (T.unpack minsPart)
      | otherwise = 0

-- | Fold the token stream into a ParsedTask; TWord tokens accumulate (in
-- order) into the title, everything else sets a structured field.
parseLine :: Text -> ParsedTask
parseLine raw = foldl apply initial (lexLine raw)
  where
    initial = ParsedTask
      { ptTitle = ""
      , ptDue = Nothing
      , ptPriority = 3
      , ptEstimateMinutes = 0
      , ptTags = []
      , ptDeliverable = Nothing
      , ptParent = Nothing
      }

    apply :: ParsedTask -> Token -> ParsedTask
    apply pt (TWord w) = pt { ptTitle = joinTitle (ptTitle pt) w }
    apply pt (TDue d) = pt { ptDue = Just d }
    apply pt (TPriority p) = pt { ptPriority = p }
    apply pt (TEstimate m) = pt { ptEstimateMinutes = m }
    apply pt (TTag tg) = pt { ptTags = ptTags pt ++ [tg] }
    apply pt (TDeliverable d) = pt { ptDeliverable = Just d }
    apply pt (TParent p) = pt { ptParent = Just p }

    joinTitle :: Text -> Text -> Text
    joinTitle acc w
      | T.null acc = w
      | otherwise = acc <> " " <> w
