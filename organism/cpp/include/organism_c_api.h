/**
 * organism_c_api.h — stable C ABI for the Organism native runtime.
 * ═══════════════════════════════════════════════════════════════════
 *
 * organism.h's classes use C++ features (references, std::function,
 * std::future) that can't be linked directly from C, Python (ctypes),
 * Node (node-ffi-napi), or any other FFI consumer — C++ name mangling
 * and ABI aren't standardized across compilers the way the C ABI is.
 * This header is the answer: every function here is `extern "C"`,
 * every struct is a plain C struct, state is passed through opaque
 * handles (organism_state_t*, organism_heartbeat_t*) so callers never
 * touch C++ internals directly.
 *
 * Two families of functions:
 *   1. Pure physics primitives (organism_order_parameter, etc.) — no
 *      handle needed, just numbers in and out. These mirror
 *      organism/python/organism/physics.py function-for-function so a
 *      Kuramoto simulation gives numerically identical results whether
 *      it runs in Python or through this native library — verified by
 *      organism/cpp/bindings/python/test_parity.py.
 *   2. Stateful runtime (organism_state_*, organism_heartbeat_*) — for
 *      embedding the always-on organism runtime (four-register state +
 *      873ms heartbeat) in a host process instead of running it as the
 *      standalone `organism` executable.
 *
 * Build as a shared library:
 *   cmake -B build . && cmake --build build --target organism_native
 *   → build/liborganism_native.so (Linux) / .dylib (macOS) / .dll (Windows)
 *
 * Thread safety: the stateful API (organism_state_t, organism_heartbeat_t)
 * is internally mutex-guarded, same as the C++ classes it wraps — safe
 * to call from multiple threads. The pure physics functions are
 * stateless and always safe.
 */
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>

/* ── Version ────────────────────────────────────────────────────────── */

#define ORGANISM_C_API_VERSION_MAJOR 1
#define ORGANISM_C_API_VERSION_MINOR 0
#define ORGANISM_C_API_VERSION_PATCH 0

/** Returns a static, null-terminated version string, e.g. "1.0.0". Never NULL. */
const char* organism_version(void);

/* ── Constants ──────────────────────────────────────────────────────── */

double organism_phi(void);           /* 1.618033988749895 */
double organism_golden_angle(void);  /* 137.508 (degrees) */
int    organism_heartbeat_ms(void);  /* 873 */

/* ── Pure physics primitives (mirror physics.py exactly) ──────────────── */

/**
 * Kuramoto order parameter over `count` phases (radians).
 * Writes the synchrony magnitude R in [0,1] to *out_r and the collective
 * phase (radians) to *out_psi. Either output pointer may be NULL if the
 * caller doesn't need that value. `count == 0` yields R=0, psi=0.
 */
void organism_order_parameter(const double* phases, size_t count,
                               double* out_r, double* out_psi);

/**
 * Advance a mean-field (fully-connected) population of phase oscillators
 * by one step. `phases`, `activities`, and `out_next_phases` must all
 * have length `count`; `out_next_phases` may alias `phases` for an
 * in-place update. Mirrors physics.py's mean_field_kuramoto_step.
 */
void organism_mean_field_step(const double* phases, const double* activities,
                               size_t count, double coupling, double dt,
                               double* out_next_phases);

/**
 * Phi-weighted decay toward zero. Mirrors physics.py's phi_decay.
 * Pass half_life_s <= 0 to use the default (golden-angle seconds, 137.508).
 */
double organism_phi_decay(double initial, double age_s, double half_life_s);

/* ── Parallel batch compute (the multi-core "supercomputer" core) ──────── */

/**
 * Run `population_count` INDEPENDENT Kuramoto connectomes in parallel
 * across a thread pool. Each population has `nodes_per_population`
 * oscillators, is deterministically seeded from (seed + its index), and
 * is advanced `steps` mean-field steps at the given coupling and dt. The
 * final order parameter R of each population is written to
 * out_coherence[population_count] (must be caller-allocated with that
 * length). Returns population_count on success, 0 on bad arguments.
 *
 * `thread_count <= 0` means "use all hardware threads"
 * (organism_hardware_threads()). Because populations are independent and
 * seeded by index, out_coherence is IDENTICAL regardless of thread_count
 * — parallelism changes the speed, never the answer.
 *
 * This is the embarrassingly-parallel workload the physics is built for:
 * parameter sweeps, Monte Carlo ensembles, batch scoring of many systems.
 */
size_t organism_batch_simulate(
    size_t population_count, size_t nodes_per_population, size_t steps,
    double coupling, double dt, uint64_t seed, int thread_count,
    double* out_coherence);

/** Number of hardware threads available (>= 1). */
int organism_hardware_threads(void);

/* ── Register state (four-register phi-weighted architecture) ─────────── */

typedef enum {
    ORGANISM_REGISTER_COGNITIVE = 0,
    ORGANISM_REGISTER_AFFECTIVE = 1,
    ORGANISM_REGISTER_SOMATIC   = 2,
    ORGANISM_REGISTER_SOVEREIGN = 3,
} organism_register_t;

/** Plain C struct — safe to pass by value across the ABI boundary. */
typedef struct {
    double reasoning, planning, analysis;   /* cognitive fields   */
    double emotion, mood, sentiment;        /* affective fields   */
    double energy, tension, rhythm;         /* somatic fields     */
    double autonomy, coherence, integrity;  /* sovereign fields   */
} organism_register_state_t;

/** Zero-initialized cognitive/affective/somatic fields, sovereign+somatic energy defaulted to 1.0 — matches RegisterState's C++ defaults. */
organism_register_state_t organism_register_state_default(void);

/** Phi-weighted score of a single register snapshot (the field triplet that's populated for that register's kind). */
double organism_register_phi_score(const organism_register_state_t* state);

/* ── Opaque state handle ────────────────────────────────────────────── */

typedef struct organism_state_s organism_state_t;

/** Allocate a new organism state (all registers default-initialized). Never returns NULL (aborts on OOM, same as `new` in the wrapped C++). */
organism_state_t* organism_state_create(void);
void              organism_state_destroy(organism_state_t* state);

void organism_state_set_register(organism_state_t* state, organism_register_t reg,
                                  const organism_register_state_t* value);
void organism_state_get_register(const organism_state_t* state, organism_register_t reg,
                                  organism_register_state_t* out_value);

uint64_t organism_state_beat_count(const organism_state_t* state);

/**
 * Overall vitality score across all four registers, phi-weighted by
 * register depth (cognitive highest weight, sovereign lowest — matches
 * VitalityCalculator::score with an empty sensor set).
 */
double organism_state_vitality(const organism_state_t* state);

/* ── Opaque heartbeat handle ────────────────────────────────────────── */

typedef struct organism_heartbeat_s organism_heartbeat_t;

/** Callback invoked on every beat from the heartbeat's internal thread. `user_data` is passed through unchanged. */
typedef void (*organism_beat_callback_t)(uint64_t beat_count, void* user_data);

/** Bind a heartbeat to a state — does not start it yet. */
organism_heartbeat_t* organism_heartbeat_create(organism_state_t* state);
void                  organism_heartbeat_destroy(organism_heartbeat_t* hb); /* stops if running */

/** Start/stop the background 873ms tick thread. Idempotent. */
void organism_heartbeat_start(organism_heartbeat_t* hb);
void organism_heartbeat_stop(organism_heartbeat_t* hb);

/** Register a callback fired on every beat. May be called multiple times to register multiple callbacks. Not safe to call after organism_heartbeat_start(). */
void organism_heartbeat_on_beat(organism_heartbeat_t* hb, organism_beat_callback_t cb, void* user_data);

uint64_t organism_heartbeat_count(const organism_heartbeat_t* hb);

#ifdef __cplusplus
} /* extern "C" */
#endif
