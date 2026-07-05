"""
    Organism.Physics

Kuramoto phase-coupling and reactive formula graph, mirroring
`organism.physics` from the Python package but exploiting Julia's
native numeric performance and multiple dispatch.
"""
module Physics

using ..Constants: PHI, PHI_INV, HEARTBEAT_S, GOLDEN_ANGLE_DEG

export order_parameter, mean_field_step, kuramoto_step
export phi_decay, phi_weighted_sum
export Cell, formula, invalidate!

# ── Kuramoto primitives ────────────────────────────────────────────────────────

"""
    order_parameter(phases) -> (R, ψ)

Kuramoto order parameter. R ∈ [0,1] is global synchrony; ψ is mean phase.
Identical result to Python `organism.physics.order_parameter`.
"""
function order_parameter(phases::AbstractVector{<:Real})
    n = length(phases)
    n == 0 && return (0.0, 0.0)
    z = sum(exp.(im .* phases)) / n
    (abs(z), angle(z))
end

"""
    mean_field_step(phases, activities, coupling, dt) -> phases′

Mean-field Kuramoto update (all-to-all). Numerically stable — guaranteed
convergence for K > K_c. Mirrors `mean_field_kuramoto_step` in Python.
"""
function mean_field_step(
    phases::AbstractVector{<:Real},
    activities::AbstractVector{<:Real},
    coupling::Real,
    dt::Real = HEARTBEAT_S,
)
    R, ψ = order_parameter(phases)
    next = similar(phases)
    for i in eachindex(phases)
        dθ = coupling * R * sin(ψ - phases[i]) * dt * activities[i]
        next[i] = mod(phases[i] + dθ, 2π)
    end
    next
end

"""
    kuramoto_step(phases, coupling_matrix, dt) -> phases′

Pairwise (graph) Kuramoto update. Use `mean_field_step` for large populations.
Mirrors `kuramoto_step` pairwise variant in Python.
"""
function kuramoto_step(
    phases::AbstractVector{<:Real},
    coupling_matrix::AbstractMatrix{<:Real},
    dt::Real = HEARTBEAT_S,
)
    n = length(phases)
    next = copy(phases)
    for i in 1:n
        force = 0.0
        for j in 1:n
            i == j && continue
            force += coupling_matrix[i, j] * sin(phases[j] - phases[i])
        end
        next[i] = mod(phases[i] + force * dt, 2π)
    end
    next
end

# ── Phi-decay ──────────────────────────────────────────────────────────────────

"""
    phi_decay(initial, age_s; half_life_s = GOLDEN_ANGLE_DEG) -> value

Phi-weighted exponential decay. Half-life defaults to golden angle in seconds.
"""
phi_decay(initial::Real, age_s::Real; half_life_s::Real = GOLDEN_ANGLE_DEG) =
    initial * 0.5^(age_s / half_life_s)

"""
    phi_weighted_sum(values, base = PHI) -> scalar

Compute Σ values[i] * base^(-i+1), giving highest weight to first element.
"""
function phi_weighted_sum(values::AbstractVector{<:Real}, base::Real = PHI)
    result = 0.0
    w = 1.0
    for v in values
        result += v * w
        w /= base
    end
    result
end

# ── Reactive formula graph ─────────────────────────────────────────────────────

mutable struct Cell{T}
    _value::Union{T, Nothing}
    _compute::Union{Function, Nothing}
    _dirty::Bool
    name::String
end

Cell(value::T; name::String = "") where T = Cell{T}(value, nothing, false, name)
Cell(compute::Function; name::String = "") = Cell{Any}(nothing, compute, true, name)

function formula(fn::Function; name::String = "")
    Cell{Any}(nothing, fn, true, name)
end

function Base.getproperty(c::Cell, s::Symbol)
    s === :value || return getfield(c, s)
    if getfield(c, :_dirty) && getfield(c, :_compute) !== nothing
        setfield!(c, :_value, getfield(c, :_compute)())
        setfield!(c, :_dirty, false)
    end
    getfield(c, :_value)
end

function Base.setproperty!(c::Cell, s::Symbol, v)
    s === :value || (setfield!(c, s, v); return)
    getfield(c, :_compute) !== nothing && error("Cannot set value on a formula Cell")
    setfield!(c, :_value, v)
    setfield!(c, :_dirty, false)
end

invalidate!(c::Cell) = setfield!(c, :_dirty, true)

end # module
