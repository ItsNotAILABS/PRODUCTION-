-- | PROTO-ID-003 — Sized Event History
-- The organism keeps a rolling history of exactly N events.
-- The size is a compile-time Nat — overflow is a type error.
-- Push slides the window; the oldest event is discarded by type.
module Organism.Protocols.SizedHistory

import Data.Vect
import Organism.Constants

%default total

||| A fixed-size rolling history of events of type a.
public export
record History (n : Nat) (a : Type) where
  constructor MkHistory
  events : Vect n a

||| Empty history at size 0.
export
emptyHistory : History 0 a
emptyHistory = MkHistory []

||| Singleton history.
export
singletonHistory : a -> History 1 a
singletonHistory x = MkHistory [x]

||| Push a new event, growing the history (use with bounded window).
export
push : a -> History n a -> History (S n) a
push x (MkHistory es) = MkHistory (x :: es)

||| Slide the window: push a new event and drop the oldest.
||| Size is preserved — this is the main operation for rolling logs.
export
slide : {n : Nat} -> a -> History (S n) a -> History (S n) a
slide x (MkHistory es) = MkHistory (x :: init es)

||| Read the most recent event.
export
latest : History (S n) a -> a
latest (MkHistory (x :: _)) = x

||| Read the oldest event in the window.
export
oldest : History (S n) a -> a
oldest (MkHistory es) = last es

||| Map a function over all history entries.
export
mapHistory : (a -> b) -> History n a -> History n b
mapHistory f (MkHistory es) = MkHistory (map f es)

||| Fold over a history from newest to oldest.
export
foldHistory : (b -> a -> b) -> b -> History n a -> b
foldHistory f z (MkHistory es) = foldl f z es

||| Phi-exponential weighted sum over a history of Doubles.
||| Weight at index i (0 = newest) = φ⁻ⁱ / Σ.
export
phiWeightedMean : {n : Nat} -> History (S n) Double -> Double
phiWeightedMean (MkHistory es) =
  let ws  = map (\i => phiInv ^ i) (range (S n))
      wSum = sum ws
  in sum (zipWith (*) ws es) / wSum
  where
    range : (k : Nat) -> Vect k Double
    range 0     = []
    range (S k) = cast k :: range k
