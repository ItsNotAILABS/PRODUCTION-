"""
    PROTO-JL-005 — Golden Ratio Optimizer

Gradient descent using phi-scaled step sizes. Each step size = φ^(-n),
creating a geometrically shrinking step schedule that converges without
overshooting. Applied to tuning coupling strength K toward the value
that maximises coherence for a given population.
"""
module GoldenOptimizer

using ..Physics: order_parameter, mean_field_step
using ..Constants: PHI, PHI_INV, HEARTBEAT_S

export golden_search, phi_step_descent, optimize_coupling

"""
    golden_search(f, lo, hi; tol) -> (x_min, f_min)

Golden-section search for the minimum of a unimodal function f on [lo, hi].
φ-optimal bracket reduction: each step reduces interval by factor 1/φ.
"""
function golden_search(f::Function, lo::Real, hi::Real; tol::Real = 1e-6)
    a, b = Float64(lo), Float64(hi)
    φ = PHI
    resphi = 2.0 - φ  # = 1/φ² ≈ 0.382

    x1 = a + resphi * (b - a)
    x2 = b - resphi * (b - a)
    f1, f2 = f(x1), f(x2)

    while (b - a) > tol
        if f1 < f2
            b = x2; x2 = x1; f2 = f1
            x1 = a + resphi * (b - a); f1 = f(x1)
        else
            a = x1; x1 = x2; f1 = f2
            x2 = b - resphi * (b - a); f2 = f(x2)
        end
    end
    xm = (a + b) / 2
    (xm, f(xm))
end

"""
    phi_step_descent(loss, x0; max_iter, tol) -> (x_opt, history)

Gradient-free phi-step descent. Step size at iteration n is φ^(-n).
Evaluates loss at x - step and x + step; moves in the decreasing direction.
"""
function phi_step_descent(
    loss::Function,
    x0::Float64;
    max_iter::Int = 50,
    tol::Float64 = 1e-8,
)
    x = x0
    history = Float64[loss(x)]
    for n in 1:max_iter
        step = PHI ^ (-n)
        step < tol && break
        fl = loss(x - step)
        fr = loss(x + step)
        if fl < fr && fl < history[end]
            x -= step
        elseif fr < fl && fr < history[end]
            x += step
        end
        push!(history, loss(x))
    end
    (x, history)
end

"""
    optimize_coupling(phases, activities; n_steps) -> K_opt

Find the coupling K ∈ [0.1, 2.0] that maximises coherence R
after `n_steps` integration steps, using golden-section search.
"""
function optimize_coupling(
    phases::AbstractVector{<:Real},
    activities::AbstractVector{<:Real};
    n_steps::Int = 30,
)
    loss = K -> begin
        ph = copy(phases)
        for _ in 1:n_steps
            ph = mean_field_step(ph, activities, K, HEARTBEAT_S)
        end
        R, _ = order_parameter(ph)
        -R  # maximise R = minimise -R
    end
    K_opt, _ = golden_search(loss, 0.1, 2.0)
    K_opt
end

end # module
