"""
    Organism

Julia package for the sovereign organism runtime.
Physics, routing, reactive formulas — same math as organism/python,
native Julia performance. No external dependencies; stdlib only.

```julia
using Organism
R, ψ = order_parameter(rand(96) * 2π)
phases = mean_field_step(rand(96) * 2π, fill(0.5, 96), PHI_INV)
```
"""
module Organism

include("Constants.jl")
include("Physics.jl")
include("Routing.jl")

using .Constants
using .Physics
using .Routing

export PHI, PHI_INV, PHI_SQ, GOLDEN_ANGLE_DEG, GOLDEN_ANGLE_RAD
export HEARTBEAT_MS, HEARTBEAT_S, NODE_COUNT, COHERENCE_TARGET
export REGISTER_NAMES, REGISTER_WEIGHTS

export order_parameter, mean_field_step, kuramoto_step
export phi_decay, phi_weighted_sum
export Cell, formula, invalidate!

export Route, Router, route, register_outcome!, top_routes

end # module
