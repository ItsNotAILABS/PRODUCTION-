"""
    PROTO-JL-010 — Signal Decomposition

DFT-based frequency analysis of organism signals (heartbeat amplitude,
coherence R time series, phase velocities). Identifies dominant frequencies,
detects resonance harmonics of the 873ms heartbeat, and measures spectral
entropy to quantify signal complexity. No external FFT library — pure Julia.
"""
module SignalDecomposition

using ..Constants: PHI, HEARTBEAT_S

export dft, dominant_frequencies, spectral_entropy, heartbeat_harmonics

"""
    dft(signal) -> (freqs, amplitudes)

Discrete Fourier Transform (O(N²) — suitable for signals ≤ 1024 samples).
Returns frequency bins (Hz, assuming 1/HEARTBEAT_S sample rate) and amplitudes.
"""
function dft(signal::AbstractVector{<:Real})
    N = length(signal)
    X = zeros(ComplexF64, N)
    for k in 0:N-1
        for n in 0:N-1
            X[k+1] += signal[n+1] * exp(-im * 2π * k * n / N)
        end
    end
    fs = 1.0 / HEARTBEAT_S  # sample rate (≈1.145 Hz for 873ms beats)
    freqs = [k * fs / N for k in 0:N-1]
    amplitudes = abs.(X) ./ N
    (freqs[1:N÷2], amplitudes[1:N÷2])
end

"""
    dominant_frequencies(signal, n) -> Vector{Tuple{Float64,Float64}}

Top-n (frequency_Hz, amplitude) pairs from the DFT spectrum.
"""
function dominant_frequencies(signal::AbstractVector{<:Real}, n::Int = 5)
    freqs, amps = dft(signal)
    order = sortperm(amps, rev = true)
    [(freqs[i], amps[i]) for i in order[1:min(n, end)]]
end

"""
    spectral_entropy(signal) -> Float64 ∈ [0,1]

Normalised Shannon entropy of the power spectrum. Low = few dominant
frequencies (structured); high = broad spectrum (complex/noisy).
"""
function spectral_entropy(signal::AbstractVector{<:Real})
    _, amps = dft(signal)
    power = amps .^ 2
    total = sum(power)
    total < 1e-12 && return 0.0
    p = power ./ total
    H = -sum(x * log(x) for x in p if x > 0)
    H / log(length(p))
end

"""
    heartbeat_harmonics(signal) -> Vector{Tuple{Float64,Float64}}

Find spectral components that are harmonics of the organism's 873ms
heartbeat (fundamental ≈ 1.145 Hz), returning up to 8 harmonics.
"""
function heartbeat_harmonics(signal::AbstractVector{<:Real})
    f0 = 1.0 / HEARTBEAT_S
    freqs, amps = dft(signal)
    harmonics = Tuple{Float64,Float64}[]
    for k in 1:8
        target = k * f0
        idx = argmin(abs.(freqs .- target))
        push!(harmonics, (freqs[idx], amps[idx]))
    end
    harmonics
end

end # module
