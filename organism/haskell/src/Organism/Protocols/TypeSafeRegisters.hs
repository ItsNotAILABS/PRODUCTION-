-- | PROTO-HS-004 — Phantom-Typed State Registers
-- The 4 organism registers (cognitive, affective, somatic, sovereign) are
-- accessed only through typed accessors. The phantom type parameter r
-- prevents writing cognitive state into somatic register at compile time.
module Organism.Protocols.TypeSafeRegisters
  ( Reg, mkReg, getReg, setReg, modifyReg
  , CognitiveTag, AffectiveTag, SomaticTag, SovereignTag
  , OrgState(..), emptyState, readAll, phiVitality
  ) where

import Organism.Constants (registerWeight, RegisterName(..), allRegisters)

-- Phantom type tags
data CognitiveTag
data AffectiveTag
data SomaticTag
data SovereignTag

-- | Typed register — value v with phantom tag r.
newtype Reg r v = Reg { unReg :: v } deriving (Show, Eq)

mkReg :: v -> Reg r v
mkReg = Reg

getReg :: Reg r v -> v
getReg = unReg

setReg :: v -> Reg r v -> Reg r v
setReg v _ = Reg v

modifyReg :: (v -> v) -> Reg r v -> Reg r v
modifyReg f (Reg v) = Reg (f v)

-- | Full organism state snapshot — 4 typed registers.
data OrgState v = OrgState
  { cogReg :: Reg CognitiveTag v
  , affReg :: Reg AffectiveTag v
  , somReg :: Reg SomaticTag   v
  , sovReg :: Reg SovereignTag v
  , beat   :: Int
  } deriving (Show, Eq)

emptyState :: (Num v) => OrgState v
emptyState = OrgState (mkReg 0) (mkReg 0) (mkReg 0) (mkReg 0) 0

-- | Read all register values in canonical order [cognitive, affective, somatic, sovereign].
readAll :: OrgState v -> [v]
readAll s = [ getReg (cogReg s)
            , getReg (affReg s)
            , getReg (somReg s)
            , getReg (sovReg s)
            ]

-- | Phi-weighted vitality from all registers (values must be in [0,1]).
phiVitality :: OrgState Double -> Double
phiVitality s =
  let vals    = readAll s
      weights = map registerWeight allRegisters
  in  min 1.0 . max 0.0 $ sum (zipWith (*) weights vals)
