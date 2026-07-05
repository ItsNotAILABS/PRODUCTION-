"""
    PROTO-JL-004 — Adaptive Step Controller

Selects numerically stable dt for the Kuramoto integrator. Large dt causes
instability in sparse coupling topologies; too-small dt wastes compute.
Uses a phi-derived stability criterion: dt_max = 1/(K * R * φ).
Applies RK2 midpoint correction for higher accuracy.
"""
module AdaptiveStep

using ..Physics: order_parameter, mean_field_step
using ..Constants: PHI, PHI_INV, HEARTBEAT_S

export stable_dt, rk2_step, adaptive_integrate

"""
    stable_dt(phases, coupling) -> Float64

Maximum stable Euler step size for mean-field Kuramoto:
    dt_max = 1 / (K * R * φ)
Never exceeds HEARTBEAT_S.
"""
function stable_dt(phases::AbstractVector{<:Real}, coupling::Real)
    R, _ = order_parameter(phases)
    R < 1e-6 && return HEARTBEAT_S
    dt_max = 1.0 / (coupling * R * PHI)
    min(dt_max, HEARTBEAT_S)
end

"""
    rk2_step(phases, activities, coupling, dt) -> phases′

RK2 (midpoint) integration of mean-field Kuramoto — more accurate than
Euler for the same dt, especially during the convergence transient.
"""
function rk2_step(
    phases::AbstractVector{<:Real},
    activities::AbstractVector{<:Real},
    coupling::Real,
    dt::Real = HEARTBEAT_S,
)
    # k1: slope at start
    R1, ψ1 = order_parameter(phases)
    k1 = [coupling * R1 * sin(ψ1 - θ) * a for (θ, a) in zip(phases, activities)]

    # midpoint estimate
    mid = mod.(phases .+ 0.5 .* dt .* k1, 2π)

    # k2: slope at midpoint
    R2, ψ2 = order_parameter(mid)
    k2 = [coupling * R2 * sin(ψ2 - θ) * a for (θ, a) in zip(mid, activities)]

    mod.(phases .+ dt .* k2, 2π)
end

"""
    adaptive_integrate(phases, activities, coupling, duration) -> (phases′, steps)

Integrate for `duration` seconds using adaptive stable dt at each step.
Returns final phases and number of steps taken.
"""
function adaptive_integrate(
    phases::AbstractVector{<:Real},
    activities::AbstractVector{<:Real},
    coupling::Real,
    duration::Real,
)
    t = 0.0
    steps = 0
    ph = copy(phases)
    while t < duration
        dt = min(stable_dt(ph, coupling), duration - t)
        ph = rk2_step(ph, activities, coupling, dt)
        t += dt
        steps += 1
    end
    (ph, steps)
end

end # module
