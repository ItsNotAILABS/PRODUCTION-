"""
    PROTO-JL-002 — Coherence Rate Tracker

Measures dR/dt — the rate at which the connectome is converging toward
or diverging from the coherence target. A positive rate indicates the
organism is synchronising; negative means it is de-synchronising.
Used by adaptive controllers to decide whether to inject neurochemicals.
"""
module CoherenceRate

using ..Physics: order_parameter, mean_field_step
using ..Constants: PHI_INV, HEARTBEAT_S, COHERENCE_TARGET

export CoherenceTracker, step!, convergence_rate, time_to_lock

mutable struct CoherenceTracker
    phases::Vector{Float64}
    activities::Vector{Float64}
    coupling::Float64
    history::Vector{Float64}   # R values per beat
    window::Int                 # beats to average for dR/dt
end

function CoherenceTracker(phases::Vector{Float64}; window::Int = 10)
    R, _ = order_parameter(phases)
    CoherenceTracker(copy(phases), fill(0.5, length(phases)),
                     PHI_INV, [R], window)
end

function step!(t::CoherenceTracker, dt::Float64 = HEARTBEAT_S)
    t.phases = mean_field_step(t.phases, t.activities, t.coupling, dt)
    R, _ = order_parameter(t.phases)
    push!(t.history, R)
    R
end

"""
    convergence_rate(tracker) -> Float64

dR/dt averaged over the last `window` beats (beats/s, positive = converging).
"""
function convergence_rate(t::CoherenceTracker)
    n = min(t.window, length(t.history))
    n < 2 && return 0.0
    recent = t.history[end-n+1:end]
    (recent[end] - recent[1]) / (n * HEARTBEAT_S)
end

"""
    time_to_lock(tracker) -> Float64

Estimated seconds until R reaches COHERENCE_TARGET, given current dR/dt.
Returns Inf if already locked or rate is non-positive.
"""
function time_to_lock(t::CoherenceTracker)
    R = isempty(t.history) ? 0.0 : t.history[end]
    R >= COHERENCE_TARGET && return 0.0
    rate = convergence_rate(t)
    rate <= 0 && return Inf
    (COHERENCE_TARGET - R) / rate
end

end # module
