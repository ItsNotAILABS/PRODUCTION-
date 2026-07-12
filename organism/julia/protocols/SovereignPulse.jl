"""
    PROTO-JL-009 — Sovereign Pulse Orchestration

The top-level organism heartbeat controller. Coordinates multiple
sub-populations (cognitive, affective, somatic, sovereign registers),
coupling them with phi-weighted inter-register binding, and emitting
a unified pulse event at the 873ms organism heartbeat interval.
"""
module SovereignPulse

using ..Physics: mean_field_step, order_parameter
using ..Constants: PHI, PHI_INV, HEARTBEAT_S, REGISTER_NAMES, REGISTER_WEIGHTS, NODE_COUNT

export OrganismPulse, pulse!, register_coherence, sovereign_vitality

const NODES_PER_REGISTER = NODE_COUNT ÷ length(REGISTER_NAMES)

mutable struct OrganismPulse
    registers::Dict{Symbol, Vector{Float64}}   # phase arrays
    activities::Dict{Symbol, Vector{Float64}}
    coupling::Float64
    beat::Int
    history::Vector{Dict{Symbol,Float64}}      # R per register per beat
end

function OrganismPulse(; seed::Union{Int,Nothing} = nothing)
    rng = seed === nothing ? rand : let s = seed; () -> (s ⊻= s << 13; s ⊻= s >> 7; s ⊻= s << 17; abs(s) / typemax(Int)); end
    regs = Dict(r => [rng() * 2π for _ in 1:NODES_PER_REGISTER] for r in REGISTER_NAMES)
    acts = Dict(r => fill(0.5, NODES_PER_REGISTER) for r in REGISTER_NAMES)
    OrganismPulse(regs, acts, PHI_INV, 0, [])
end

"""
    pulse!(op, dt) -> Dict{Symbol,Float64}

Advance each register by one heartbeat step. Returns current R per register.
The sovereign register drives its coupling slightly higher (×φ) as the
authority register per organism architecture.
"""
function pulse!(op::OrganismPulse, dt::Float64 = HEARTBEAT_S)
    rs = Dict{Symbol,Float64}()
    for reg in REGISTER_NAMES
        K = reg === :sovereign ? min(1.0, op.coupling * PHI) : op.coupling
        op.registers[reg] = mean_field_step(op.registers[reg], op.activities[reg], K, dt)
        R, _ = order_parameter(op.registers[reg])
        rs[reg] = R
    end
    op.beat += 1
    push!(op.history, rs)
    rs
end

"""
    register_coherence(op) -> Dict{Symbol,Float64}

Current order parameter R for each of the 4 registers.
"""
function register_coherence(op::OrganismPulse)
    Dict(r => order_parameter(op.registers[r])[1] for r in REGISTER_NAMES)
end

"""
    sovereign_vitality(op) -> Float64 ∈ [0,1]

Phi-weighted composite vitality from all register coherences.
Uses exact REGISTER_WEIGHTS from Constants (φ⁴ : φ³ : φ² : φ¹).
"""
function sovereign_vitality(op::OrganismPulse)
    rs = register_coherence(op)
    total = sum(rs[r] * REGISTER_WEIGHTS[r] for r in REGISTER_NAMES)
    clamp(total, 0.0, 1.0)
end

end # module
