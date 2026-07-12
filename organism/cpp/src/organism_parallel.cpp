/**
 * organism_parallel.cpp — multi-threaded batch simulation engine.
 * ═══════════════════════════════════════════════════════════════════
 *
 * The "supercomputer" core: runs many independent Kuramoto connectomes
 * in parallel across a thread pool, each population advanced through its
 * own mean-field trajectory. This is the embarrassingly-parallel HPC
 * workload the physics is naturally suited to — parameter sweeps, Monte
 * Carlo ensembles, batch inference over many independent systems.
 *
 * Two correctness invariants this file upholds and that the tests verify:
 *   1. DETERMINISM INDEPENDENT OF THREAD COUNT. Each population i is
 *      seeded deterministically from (base_seed + i) via splitmix64, and
 *      populations never interact, so out_coherence[] is bit-identical
 *      whether run on 1 thread or 64. If parallelism changed the answer,
 *      it would be a bug, not a feature — the test asserts 1-thread and
 *      N-thread results match exactly.
 *   2. NUMERICAL CONSISTENCY with the single-population physics. The
 *      per-population step uses the same mean-field Kuramoto formula as
 *      organism_mean_field_step / physics.py, so a batch of one population
 *      matches a hand-run single simulation.
 */
#include "organism_c_api.h"
#include "organism.h"

#include <cmath>
#include <cstdint>
#include <thread>
#include <vector>

namespace {

/* splitmix64 — fast, well-distributed seeding from a single 64-bit seed.
 * Deterministic, so a given (base_seed, population_index) always yields
 * the same initial phases regardless of which thread computes it. */
inline uint64_t splitmix64(uint64_t& s) {
    uint64_t z = (s += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

/* Uniform double in [0, 2π) from a splitmix64 stream. */
inline double next_phase(uint64_t& s) {
    // top 53 bits → [0,1), scaled to [0, 2π)
    const double unit = (splitmix64(s) >> 11) * (1.0 / 9007199254740992.0);
    return unit * (2.0 * M_PI);
}

/* Simulate one connectome to completion; return final order parameter R.
 * Uses two ping-pong buffers to avoid per-step allocation. */
double simulate_one(size_t nodes, size_t steps, double coupling, double dt, uint64_t seed) {
    if (nodes == 0) return 0.0;

    std::vector<double> a(nodes), b(nodes);
    uint64_t s = seed;
    for (size_t i = 0; i < nodes; ++i) a[i] = next_phase(s);

    std::vector<double>* cur = &a;
    std::vector<double>* nxt = &b;
    const double two_pi = 2.0 * M_PI;

    for (size_t step = 0; step < steps; ++step) {
        // order parameter of cur
        double sum_cos = 0.0, sum_sin = 0.0;
        for (size_t i = 0; i < nodes; ++i) {
            sum_cos += std::cos((*cur)[i]);
            sum_sin += std::sin((*cur)[i]);
        }
        sum_cos /= static_cast<double>(nodes);
        sum_sin /= static_cast<double>(nodes);
        const double r = std::hypot(sum_cos, sum_sin);
        const double psi = std::atan2(sum_sin, sum_cos);

        // mean-field update (activity = 1.0 for every node, matching a
        // uniformly-active connectome; per-node activity is available in
        // the single-population API for callers that need it)
        for (size_t i = 0; i < nodes; ++i) {
            const double theta = (*cur)[i];
            double v = std::fmod(theta + coupling * r * std::sin(psi - theta) * dt, two_pi);
            if (v < 0.0) v += two_pi;
            (*nxt)[i] = v;
        }
        std::swap(cur, nxt);
    }

    // final coherence
    double sum_cos = 0.0, sum_sin = 0.0;
    for (size_t i = 0; i < nodes; ++i) {
        sum_cos += std::cos((*cur)[i]);
        sum_sin += std::sin((*cur)[i]);
    }
    return std::hypot(sum_cos / static_cast<double>(nodes), sum_sin / static_cast<double>(nodes));
}

} // namespace

extern "C" {

size_t organism_batch_simulate(
    size_t population_count, size_t nodes_per_population, size_t steps,
    double coupling, double dt, uint64_t seed, int thread_count,
    double* out_coherence) {

    if (population_count == 0 || out_coherence == nullptr) return 0;

    unsigned hw = std::thread::hardware_concurrency();
    if (hw == 0) hw = 1;
    unsigned workers = (thread_count > 0)
        ? static_cast<unsigned>(thread_count)
        : hw;
    if (workers > population_count) workers = static_cast<unsigned>(population_count);
    if (workers == 0) workers = 1;

    // Contiguous static partition — populations are equal-cost (same
    // nodes/steps), so a simple even split balances well without the
    // overhead of a work-stealing queue.
    auto run_range = [&](size_t begin, size_t end) {
        for (size_t p = begin; p < end; ++p) {
            // Each population deterministically seeded from base seed + index.
            out_coherence[p] = simulate_one(nodes_per_population, steps, coupling, dt, seed + p);
        }
    };

    if (workers == 1) {
        run_range(0, population_count);
        return population_count;
    }

    std::vector<std::thread> pool;
    pool.reserve(workers);
    const size_t chunk = (population_count + workers - 1) / workers;
    for (unsigned w = 0; w < workers; ++w) {
        const size_t begin = static_cast<size_t>(w) * chunk;
        if (begin >= population_count) break;
        const size_t end = std::min(begin + chunk, population_count);
        pool.emplace_back(run_range, begin, end);
    }
    for (auto& t : pool) t.join();

    return population_count;
}

int organism_hardware_threads(void) {
    unsigned hw = std::thread::hardware_concurrency();
    return hw == 0 ? 1 : static_cast<int>(hw);
}

} // extern "C"
