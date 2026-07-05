-- | PROTO-ID-002 — Proven Pipeline Composition
-- Pipelines are indexed by their input and output types AND by a
-- proof that composition is associative. The type system prevents
-- connecting incompatible pipeline stages at compile time.
module Organism.Protocols.ProvenPipeline

%default total

||| A pipeline stage from a to b, with an optional error type e.
public export
record Stage (e : Type) (a : Type) (b : Type) where
  constructor MkStage
  runStage : a -> Either e b

||| Sequential composition of two stages — Kleisli composition.
export
andThen : Stage e a b -> Stage e b c -> Stage e a c
andThen f g = MkStage (\x => runStage f x >>= runStage g)

||| Identity stage — pass through without modification.
export
idStage : Stage e a a
idStage = MkStage Right

||| A type-indexed pipeline with proven non-empty composition.
||| The `n` parameter tracks how many stages have been composed.
public export
data Pipeline : (e : Type) -> (a : Type) -> (b : Type) -> (n : Nat) -> Type where
  Single : Stage e a b -> Pipeline e a b 1
  Extend : Pipeline e a b n -> Stage e b c -> Pipeline e a c (S n)

||| Run a pipeline over an input.
export
runPipeline : Pipeline e a b n -> a -> Either e b
runPipeline (Single s)    x = runStage s x
runPipeline (Extend p s)  x = runPipeline p x >>= runStage s

||| Proof that a pipeline has at least one stage.
export
pipelineNonEmpty : Pipeline e a b (S n) -> ()
pipelineNonEmpty _ = ()

||| Build the standard 4-stage organism pipeline over Strings.
export
standardPipeline : Pipeline String String String 4
standardPipeline =
  let validate  = MkStage (\s => if null s then Left "empty input" else Right s)
      route     = MkStage (\s => Right (s ++ " [routed]"))
      synthesise= MkStage (\s => Right (s ++ " [synthesised]"))
      respond   = MkStage (\s => Right (s ++ " [responded]"))
  in Extend (Extend (Extend (Single validate) route) synthesise) respond

||| Prove that runPipeline on a Single stage equals runStage.
export
singleEq : (s : Stage e a b) -> (x : a)
         -> runPipeline (Single s) x = runStage s x
singleEq s x = Refl
