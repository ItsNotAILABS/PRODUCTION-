"""
    Organism.Constants

Phi-encoded universal constants. All organism math derives from these.
"""
module Constants

export PHI, PHI_INV, PHI_SQ, GOLDEN_ANGLE_DEG, GOLDEN_ANGLE_RAD
export HEARTBEAT_MS, HEARTBEAT_S, NODE_COUNT, COHERENCE_TARGET
export REGISTER_NAMES, REGISTER_WEIGHTS

const PHI             = 1.618033988749895
const PHI_INV         = 1.0 / PHI
const PHI_SQ          = PHI * PHI
const GOLDEN_ANGLE_DEG = 137.508
const GOLDEN_ANGLE_RAD = GOLDEN_ANGLE_DEG * π / 180.0
const HEARTBEAT_MS    = 873
const HEARTBEAT_S     = HEARTBEAT_MS / 1000.0
const NODE_COUNT      = 96
const COHERENCE_TARGET = 0.87

# 4-register state architecture (cognitive, affective, somatic, sovereign)
const REGISTER_NAMES = (:cognitive, :affective, :somatic, :sovereign)

# Phi-power weights (normalised to sum 1.0) — mirrors organism.vitality
const _RAW_WEIGHTS = Dict(
    :cognitive => PHI^3,   # ≈ 4.236
    :affective => PHI^2,   # ≈ 2.618
    :somatic   => PHI^1,   # ≈ 1.618
    :sovereign => PHI^4,   # ≈ 6.854
)
const _WEIGHT_SUM = sum(values(_RAW_WEIGHTS))
const REGISTER_WEIGHTS = Dict(k => v / _WEIGHT_SUM for (k, v) in _RAW_WEIGHTS)

end # module
