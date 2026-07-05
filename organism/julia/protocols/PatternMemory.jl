"""
    PROTO-JL-008 — Pattern Memory (Attractor States)

Stores phase configurations that represent learned attractor states.
When the connectome reaches a known attractor, memory recognises it
and can recall the associated context. Uses cosine similarity on
phase vectors as the recognition metric.
"""
module PatternMemory

using ..Physics: order_parameter
using ..Constants: PHI, PHI_INV

export AttractorMemory, store!, recall, nearest_attractor

struct Attractor
    id::String
    phases::Vector{Float64}
    R::Float64
    label::String
    stored_at::Float64
end

mutable struct AttractorMemory
    attractors::Vector{Attractor}
    capacity::Int
end

AttractorMemory(capacity::Int = 128) = AttractorMemory(Attractor[], capacity)

function _phase_cosine(a::AbstractVector{<:Real}, b::AbstractVector{<:Real})
    # Cosine similarity on complex phasors
    za = sum(exp.(im .* a))
    zb = sum(exp.(im .* b))
    abs(za) < 1e-9 || abs(zb) < 1e-9 && return 0.0
    clamp(real(za * conj(zb)) / (abs(za) * abs(zb)), -1.0, 1.0)
end

"""
    store!(mem, id, phases, label) -> Attractor

Store a phase configuration as a named attractor.
Evicts the oldest entry when at capacity.
"""
function store!(mem::AttractorMemory, id::String, phases::AbstractVector{<:Real},
                label::String = "")
    R, _ = order_parameter(phases)
    att = Attractor(id, copy(phases), R, label, time())
    length(mem.attractors) >= mem.capacity && popfirst!(mem.attractors)
    push!(mem.attractors, att)
    att
end

"""
    nearest_attractor(mem, phases) -> (Attractor?, similarity)

Find the stored attractor most similar to current phases.
Similarity is cosine similarity on complex phasors ∈ [0, 1].
"""
function nearest_attractor(mem::AttractorMemory, phases::AbstractVector{<:Real})
    isempty(mem.attractors) && return (nothing, 0.0)
    best, best_sim = mem.attractors[1], -Inf
    for att in mem.attractors
        sim = _phase_cosine(phases, att.phases)
        sim > best_sim && (best = att; best_sim = sim)
    end
    (best, best_sim)
end

"""
    recall(mem, phases; threshold) -> Union{Attractor, Nothing}

Return the nearest attractor if similarity exceeds threshold, else nothing.
"""
function recall(mem::AttractorMemory, phases::AbstractVector{<:Real};
                threshold::Float64 = 0.95)
    att, sim = nearest_attractor(mem, phases)
    sim >= threshold ? att : nothing
end

end # module
