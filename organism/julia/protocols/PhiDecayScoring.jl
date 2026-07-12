"""
    PROTO-JL-006 — Phi-Decay Scoring Engine

Maintains a scored registry where every item's score decays by
1/φ per half-life. New evidence amplifies by φ. Applied to
model routing, protocol selection, and agent trust calibration.
"""
module PhiDecayScoring

using ..Constants: PHI, PHI_INV, GOLDEN_ANGLE_DEG

export ScoredItem, ScoreRegistry, register!, observe!, top_items, decay_all!

struct ScoredItem
    id::String
    label::String
    score::Float64
    last_updated::Float64  # monotonic seconds
end

mutable struct ScoreRegistry
    items::Dict{String, ScoredItem}
    half_life_s::Float64
end

ScoreRegistry(; half_life_s::Float64 = GOLDEN_ANGLE_DEG) =
    ScoreRegistry(Dict{String,ScoredItem}(), half_life_s)

"""
    register!(reg, id, label; initial_score)

Add a new item to the registry with an optional initial score.
"""
function register!(reg::ScoreRegistry, id::String, label::String = "";
                   initial_score::Float64 = 1.0)
    reg.items[id] = ScoredItem(id, label, initial_score, time())
end

"""
    observe!(reg, id, success) -> new_score

Record an observation for `id`. Success multiplies score by φ,
failure divides by φ, both after applying time-decay.
"""
function observe!(reg::ScoreRegistry, id::String, success::Bool)
    item = get(reg.items, id, nothing)
    item === nothing && return 0.0

    now = time()
    age_s = now - item.last_updated
    decayed = item.score * 0.5^(age_s / reg.half_life_s)
    new_score = success ? min(PHI^4, decayed * PHI) : max(PHI^-4, decayed * PHI_INV)

    reg.items[id] = ScoredItem(id, item.label, new_score, now)
    new_score
end

"""
    decay_all!(reg) -> reg

Apply time-decay to every item in the registry right now.
"""
function decay_all!(reg::ScoreRegistry)
    now = time()
    for (id, item) in reg.items
        age_s = now - item.last_updated
        decayed = item.score * 0.5^(age_s / reg.half_life_s)
        reg.items[id] = ScoredItem(id, item.label, decayed, now)
    end
    reg
end

"""
    top_items(reg, n) -> Vector{ScoredItem}

Return the n highest-scoring items, freshly decayed.
"""
function top_items(reg::ScoreRegistry, n::Int = 10)
    decay_all!(reg)
    sorted = sort(collect(values(reg.items)), by = i -> i.score, rev = true)
    sorted[1:min(n, length(sorted))]
end

end # module
