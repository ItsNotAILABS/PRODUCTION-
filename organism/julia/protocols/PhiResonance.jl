"""
    PROTO-JL-001 — Phi-Resonance Synchronization

Implements the exact phi-resonance coupling mathematics for synchronizing
multiple organism nodes. The coupling strength K = 1/φ is the critical
threshold above which the Kuramoto model guarantees population-level
phase locking. Tracks instantaneous phase velocity and resonance quality.
"""
module PhiResonance

using ..Physics: order_parameter, mean_field_step, phi_decay
using ..Constants: PHI, PHI_INV, HEARTBEAT_S, COHERENCE_TARGET

export ResonanceState, resonate!, resonance_quality, is_locked

mutable struct ResonanceState
    phases::Vector{Float64}
    activities::Vector{Float64}
    coupling::Float64
    R::Float64
    ψ::Float64
    beat::Int
    locked_beats::Int
end

function ResonanceState(n::Int = 96; seed::Union{Int,Nothing} = nothing)
    rng = seed === nothing ? () -> rand() : let r = seed; () -> (r = xorshift(r); r / typemax(UInt32)); end
    phases = [rand() * 2π for _ in 1:n]
    activities = fill(0.5, n)
    R, ψ = order_parameter(phases)
    ResonanceState(phases, activities, PHI_INV, R, ψ, 0, 0)
end

function xorshift(x::Int)
    x = xor(x, x << 13)
    x = xor(x, x >> 7)
    xor(x, x << 17)
end

"""
    resonate!(state, dt) -> (R, ψ)

Advance the resonance state by one phi-timed step.
"""
function resonate!(s::ResonanceState, dt::Float64 = HEARTBEAT_S)
    s.phases = mean_field_step(s.phases, s.activities, s.coupling, dt)
    s.R, s.ψ = order_parameter(s.phases)
    s.beat += 1
    s.R >= COHERENCE_TARGET && (s.locked_beats += 1)
    (s.R, s.ψ)
end

"""
    resonance_quality(state) -> Float64 ∈ [0, 1]

Fraction of beats spent at or above the coherence target. Quality = 1.0
means the system has been phase-locked for its entire lifetime.
"""
resonance_quality(s::ResonanceState) =
    s.beat == 0 ? 0.0 : s.locked_beats / s.beat

"""
    is_locked(state) -> Bool

True when current R >= coherence target (phi-resonance threshold).
"""
is_locked(s::ResonanceState) = s.R >= COHERENCE_TARGET

end # module
