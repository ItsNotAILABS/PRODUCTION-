-- | Phantom-typed 4-register state store.
-- Type parameter r encodes which register is being accessed,
-- preventing cognitive state from leaking into somatic register etc.
module Organism.State
  ( Register, mkRegister, readRegister, writeRegister
  , Cognitive, Affective, Somatic, Sovereign
  , StateSnapshot(..), snapshot, vitality
  ) where

import Organism.Constants
  (RegisterName(..), registerWeight, allRegisters, phi)

-- | Phantom type tags for each register.
data Cognitive
data Affective
data Somatic
data Sovereign

-- | A typed register holding a value v tagged with register type r.
newtype Register r v = Register { _val :: v }
  deriving (Show, Eq)

mkRegister :: v -> Register r v
mkRegister = Register

readRegister :: Register r v -> v
readRegister = _val

writeRegister :: v -> Register r v -> Register r v
writeRegister v _ = Register v

-- | A snapshot of all 4 registers at a given beat.
data StateSnapshot v = StateSnapshot
  { cognitiveReg :: Register Cognitive v
  , affectiveReg :: Register Affective v
  , somaticReg   :: Register Somatic   v
  , sovereignReg :: Register Sovereign v
  , snapBeat     :: Int
  } deriving (Show)

snapshot
  :: Register Cognitive v
  -> Register Affective v
  -> Register Somatic   v
  -> Register Sovereign v
  -> Int
  -> StateSnapshot v
snapshot = StateSnapshot

-- | Phi-weighted vitality score from 4 register scores in [0,1].
vitality
  :: StateSnapshot Double   -- ^ register values must be in [0,1]
  -> Double
vitality s =
  let scores = zip allRegisters
        [ readRegister (cognitiveReg s)
        , readRegister (affectiveReg s)
        , readRegister (somaticReg s)
        , readRegister (sovereignReg s)
        ]
      weighted = sum [ registerWeight r * v | (r, v) <- scores ]
  in  max 0 (min 1 weighted)
