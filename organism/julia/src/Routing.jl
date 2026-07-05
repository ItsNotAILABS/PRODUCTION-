"""
    Organism.Routing

Phi-weighted intelligent routing over the protocol mesh.
Routes tasks to optimal protocols using adaptive phi-decay scoring.
"""
module Routing

using ..Constants: PHI, PHI_INV

export Route, Router, route, register_outcome!, top_routes

struct Route
    protocol_id::String
    name::String
    ring::String
    intelligence_class::String
    score::Float64
end

mutable struct Router
    protocols::Vector{Dict{String,String}}
    scores::Dict{String,Float64}
end

function Router(protocols::Vector{Dict{String,String}})
    n = length(protocols)
    scores = Dict{String,Float64}()
    for (i, p) in enumerate(protocols)
        # Base score: phi^(-i/n) — earlier protocols higher priority
        scores[get(p, "protocol_id", string(i))] = PHI ^ (-(i-1) / max(1, n))
    end
    Router(protocols, scores)
end

"""
    route(r, task) -> Route

Find the highest-scoring protocol for a task. Task is a NamedTuple or Dict
with optional fields: ring, intelligence_class, keyword.
"""
function route(r::Router, task::NamedTuple = NamedTuple())
    best = nothing
    best_score = -Inf
    ring_kw = lowercase(get(task, :ring, ""))
    cls_kw  = lowercase(get(task, :intelligence_class, ""))
    kw      = lowercase(get(task, :keyword, ""))

    for p in r.protocols
        pid = get(p, "protocol_id", "")
        score = get(r.scores, pid, 1.0)

        ring = lowercase(get(p, "ring_affinity", ""))
        cls  = lowercase(get(p, "intelligence_class", ""))
        text = lowercase(join([get(p, "protocol_name", ""), get(p, "primary_function", "")], " "))

        !isempty(ring_kw) && occursin(ring_kw, ring) && (score *= PHI^2)
        !isempty(cls_kw)  && occursin(cls_kw, cls)   && (score *= PHI)
        !isempty(kw)      && occursin(kw, text)       && (score *= PHI)

        if score > best_score
            best_score = score
            best = Route(pid, get(p, "protocol_name", ""), get(p, "ring_affinity", ""),
                         get(p, "intelligence_class", ""), score)
        end
    end
    best
end

"""
    register_outcome!(r, protocol_id, success)

Phi-decay adaptive feedback. Successful routes amplify by φ, failures decay.
"""
function register_outcome!(r::Router, protocol_id::String, success::Bool)
    prior = get(r.scores, protocol_id, 1.0)
    r.scores[protocol_id] = success ? min(PHI^3, prior * PHI) : max(PHI^-3, prior * PHI_INV)
end

"""
    top_routes(r, task, n) -> Vector{Route}

Return top-n protocol routes for a task, sorted by score descending.
"""
function top_routes(r::Router, task::NamedTuple = NamedTuple(), n::Int = 5)
    routes = Route[]
    for p in r.protocols
        pid = get(p, "protocol_id", "")
        score = get(r.scores, pid, 1.0)
        ring = lowercase(get(p, "ring_affinity", ""))
        cls  = lowercase(get(p, "intelligence_class", ""))
        text = lowercase(join([get(p, "protocol_name", ""), get(p, "primary_function", "")], " "))
        ring_kw = lowercase(get(task, :ring, ""))
        cls_kw  = lowercase(get(task, :intelligence_class, ""))
        kw      = lowercase(get(task, :keyword, ""))
        !isempty(ring_kw) && occursin(ring_kw, ring) && (score *= PHI^2)
        !isempty(cls_kw)  && occursin(cls_kw, cls)   && (score *= PHI)
        !isempty(kw)      && occursin(kw, text)       && (score *= PHI)
        push!(routes, Route(pid, get(p, "protocol_name", ""), ring,
                            get(p, "intelligence_class", ""), score))
    end
    sort!(routes, by = r -> r.score, rev = true)
    routes[1:min(n, length(routes))]
end

end # module
