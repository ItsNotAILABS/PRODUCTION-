"""
    PROTO-JL-003 — Entropy Measurement

Shannon entropy of the phase distribution. Maximum entropy (log N bits)
indicates fully disordered phases; zero entropy means all phases are
identical (perfect lock). Used to quantify how much information the
organism's connectome is encoding versus synchronizing.
"""
module EntropyMeasurement

using ..Physics: order_parameter
using ..Constants: PHI

export phase_entropy, bin_phases, mutual_information, entropy_ratio

"""
    bin_phases(phases, nbins) -> Vector{Float64}

Histogram the phase distribution into `nbins` equal-width bins over [0, 2π].
Returns normalised probability vector (sums to 1).
"""
function bin_phases(phases::AbstractVector{<:Real}, nbins::Int = 32)
    counts = zeros(nbins)
    for θ in phases
        bin = clamp(floor(Int, mod(θ, 2π) / (2π / nbins)) + 1, 1, nbins)
        counts[bin] += 1
    end
    counts ./ max(1, length(phases))
end

"""
    phase_entropy(phases, nbins) -> Float64 (nats)

Shannon entropy H = -Σ p·log(p) of the phase distribution.
"""
function phase_entropy(phases::AbstractVector{<:Real}, nbins::Int = 32)
    probs = bin_phases(phases, nbins)
    H = 0.0
    for p in probs
        p > 0 && (H -= p * log(p))
    end
    H
end

"""
    entropy_ratio(phases, nbins) -> Float64 ∈ [0,1]

Entropy normalised by maximum entropy log(nbins). Value near 0 = locked;
near 1 = fully disordered.
"""
function entropy_ratio(phases::AbstractVector{<:Real}, nbins::Int = 32)
    H = phase_entropy(phases, nbins)
    H_max = log(nbins)
    H_max == 0 ? 0.0 : clamp(H / H_max, 0.0, 1.0)
end

"""
    mutual_information(phases_a, phases_b, nbins) -> Float64

Approximate mutual information between two phase populations.
I(A;B) = H(A) + H(B) - H(A,B)
"""
function mutual_information(
    phases_a::AbstractVector{<:Real},
    phases_b::AbstractVector{<:Real},
    nbins::Int = 16,
)
    # Joint distribution over pairs (discretised)
    joint = zeros(nbins, nbins)
    n = min(length(phases_a), length(phases_b))
    for i in 1:n
        a = clamp(floor(Int, mod(phases_a[i], 2π) / (2π / nbins)) + 1, 1, nbins)
        b = clamp(floor(Int, mod(phases_b[i], 2π) / (2π / nbins)) + 1, 1, nbins)
        joint[a, b] += 1
    end
    joint ./= max(1, n)
    Ha = phase_entropy(phases_a, nbins)
    Hb = phase_entropy(phases_b, nbins)
    Hab = -sum(p * log(p) for p in joint if p > 0)
    max(0.0, Ha + Hb - Hab)
end

end # module
