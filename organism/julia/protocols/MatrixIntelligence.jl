"""
    PROTO-JL-007 — Matrix Intelligence Routing

Formulates protocol routing as a matrix problem. The routing matrix M
has M[i,j] = coupling strength from protocol i to task j. Julia's native
linear algebra operates on this natively. Computes optimal assignment
via phi-weighted spectral decomposition.
"""
module MatrixIntelligence

using ..Constants: PHI, PHI_INV

export RoutingMatrix, build_routing_matrix, route_task, top_assignments

struct RoutingMatrix
    M::Matrix{Float64}      # n_protocols × n_capabilities
    protocol_ids::Vector{String}
    capability_ids::Vector{String}
end

"""
    build_routing_matrix(protocols, capabilities) -> RoutingMatrix

Build M[i,j] = phi^(-distance) where distance is the number of
unmatched keywords between protocol i's function and capability j.
"""
function build_routing_matrix(
    protocols::Vector{<:NamedTuple},
    capabilities::Vector{String},
)
    n_p = length(protocols)
    n_c = length(capabilities)
    M = zeros(n_p, n_c)
    pids = [string(get(p, :id, i)) for (i, p) in enumerate(protocols)]

    for (i, p) in enumerate(protocols)
        text = lowercase(join([
            get(p, :name, ""), get(p, :function_, ""), get(p, :ring, "")
        ], " "))
        words = Set(split(text))
        for (j, cap) in enumerate(capabilities)
            cap_words = Set(split(lowercase(cap)))
            overlap = length(intersect(words, cap_words))
            M[i, j] = PHI ^ (-max(0, length(cap_words) - overlap))
        end
    end

    RoutingMatrix(M, pids, capabilities)
end

"""
    route_task(rm, capability_idx) -> (protocol_id, score)

Find the best protocol for a given capability index via column maximum.
"""
function route_task(rm::RoutingMatrix, capability_idx::Int)
    col = rm.M[:, capability_idx]
    best_i = argmax(col)
    (rm.protocol_ids[best_i], col[best_i])
end

"""
    top_assignments(rm, capability_idx, n) -> Vector{Tuple{String,Float64}}

Top-n protocols for a capability, sorted by phi-weight descending.
"""
function top_assignments(rm::RoutingMatrix, capability_idx::Int, n::Int = 5)
    col = rm.M[:, capability_idx]
    order = sortperm(col, rev = true)
    [(rm.protocol_ids[i], col[i]) for i in order[1:min(n, end)]]
end

end # module
