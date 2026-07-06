{-# LANGUAGE OverloadedStrings #-}
module Main (main) where

import Data.Aeson (FromJSON (..), withObject, (.:), object, (.=))
import qualified Data.Text as T
import System.Environment (lookupEnv)
import Web.Scotty

import TaskLang (parseLine)

newtype ParseRequest = ParseRequest { reqLine :: T.Text }

instance FromJSON ParseRequest where
  parseJSON = withObject "ParseRequest" $ \o -> ParseRequest <$> o .: "line"

main :: IO ()
main = do
  portEnv <- lookupEnv "PORT"
  let port = maybe 8200 read portEnv
  scotty port $ do
    get "/health" $
      json $ object ["status" .= ("ok" :: T.Text), "engine" .= ("haskell" :: T.Text)]

    post "/parse" $ do
      ParseRequest ln <- jsonData
      json (parseLine ln)
