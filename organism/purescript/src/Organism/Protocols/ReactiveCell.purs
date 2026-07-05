-- | PROTO-PS-001 — Reactive Cell (Spreadsheet-style formula graph)
-- PureScript's Effect monad gives us safe, trackable mutability.
-- Each Cell holds a cached value and a recompute thunk.
-- Dependency invalidation propagates lazily — subscribers recompute
-- on next read, not at write time.
module Organism.Protocols.ReactiveCell
  ( Cell, newCell, newFormula, readCell, writeCell, invalidate
  , (<~>), mapCell
  ) where

import Prelude
import Effect (Effect)
import Effect.Ref as Ref
import Data.Maybe (Maybe(..))

-- | A reactive cell — either a source value or a derived formula.
newtype Cell a = Cell
  { cached     :: Ref.Ref (Maybe a)
  , recompute  :: Maybe (Effect a)
  , deps       :: Ref.Ref (Array (Cell Unit))
  }

-- | Create a source cell with an initial value.
newCell :: forall a. a -> Effect (Cell a)
newCell v = do
  cached <- Ref.new (Just v)
  deps   <- Ref.new []
  pure $ Cell { cached, recompute: Nothing, deps }

-- | Create a derived cell whose value is computed by an Effect.
newFormula :: forall a. Effect a -> Effect (Cell a)
newFormula fn = do
  cached <- Ref.new Nothing
  deps   <- Ref.new []
  pure $ Cell { cached, recompute: Just fn, deps }

-- | Read a cell's value, computing it if the cache is empty.
readCell :: forall a. Cell a -> Effect a
readCell (Cell c) = do
  cached <- Ref.read c.cached
  case cached of
    Just v  -> pure v
    Nothing ->
      case c.recompute of
        Nothing -> pure (unsafeCoerce unit)   -- source cells always have cache
        Just fn -> do
          v <- fn
          Ref.write (Just v) c.cached
          pure v

-- | Write to a source cell and invalidate all downstream cells.
writeCell :: forall a. Cell a -> a -> Effect Unit
writeCell (Cell c) v = do
  Ref.write (Just v) c.cached
  deps <- Ref.read c.deps
  traverse_ invalidate deps
  where
    traverse_ :: forall b. (b -> Effect Unit) -> Array b -> Effect Unit
    traverse_ f = void <<< sequence <<< map f
    sequence :: forall b. Array (Effect b) -> Effect (Array b)
    sequence = foldr (\x acc -> do
      x'  <- x
      xs' <- acc
      pure (x' `cons` xs')) (pure [])
    cons :: forall b. b -> Array b -> Array b
    cons = unsafeCoerce (\x xs -> [x, ...xs])

-- | Invalidate a cell's cache (forces recompute on next read).
invalidate :: Cell Unit -> Effect Unit
invalidate (Cell c) = Ref.write Nothing c.cached

-- | Map a pure function over a cell (creates a derived cell).
mapCell :: forall a b. (a -> b) -> Cell a -> Effect (Cell b)
mapCell f src = newFormula (f <$> readCell src)

-- | Combine two cells with a binary function.
infixl 4 combineWith as <~>
combineWith :: forall a b c. Cell a -> Cell b -> (a -> b -> c) -> Effect (Cell c)
combineWith ca cb f = newFormula do
  a <- readCell ca
  b <- readCell cb
  pure (f a b)
