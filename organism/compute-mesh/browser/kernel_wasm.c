/**
 * kernel_wasm.c — the organism Kuramoto batch kernel, compiled to
 * WebAssembly so browser compute nodes run the REAL kernel at near-native
 * speed instead of a hand-written JS re-implementation.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Same algorithm as organism/cpp/src/organism_parallel.cpp — this is not
 * a fork of the physics, it's the same math expressed for a freestanding
 * WASM target (no libc, no malloc). Determinism notes:
 *
 *   - splitmix64 uses native WASM i64 — exact, no BigInt games.
 *   - hypot is sqrt(x*x + y*y) via __builtin_sqrt → the f64.sqrt WASM
 *     instruction, which is IEEE-754 correctly-rounded and identical on
 *     every WASM engine.
 *   - fmod is implemented with __builtin_trunc → f64.trunc, also a native
 *     deterministic instruction.
 *   - Only sin / cos / atan2 are imported from the host (the JS Math
 *     object). Those three are the sole source of any cross-engine
 *     rounding difference — every other operation is bit-deterministic by
 *     the WASM spec. (A fully self-contained build would compile software
 *     sin/cos in too; that's the documented next step for exact
 *     cross-node-type parity.)
 *
 * Build (clang, wasm32, freestanding — no emscripten needed):
 *   clang --target=wasm32 -O3 -nostdlib -ffreestanding \
 *     -Wl,--no-entry -Wl,--export-dynamic -Wl,--allow-undefined \
 *     -Wl,--initial-memory=16777216 \
 *     kernel_wasm.c -o kernel.wasm
 *
 * Host must supply imports (env.sin, env.cos, env.atan2) and read results
 * from the exported linear memory. See wasm_runner.js.
 */

typedef unsigned long long u64;
typedef unsigned int       u32;

/* Host-provided transcendental functions (JS Math.* in browser and Node). */
extern double sin(double);
extern double cos(double);
extern double atan2(double, double);

/* Native WASM instructions via clang builtins — no host, fully deterministic. */
static inline double wsqrt(double x)  { return __builtin_sqrt(x); }
static inline double wtrunc(double x) { return __builtin_trunc(x); }

static const double TWO_PI = 6.283185307179586476925286766559;

static inline double wfmod(double a, double b) {
    /* a - trunc(a / b) * b — matches C fmod for the finite, positive-b
     * inputs this kernel uses (b is always TWO_PI). */
    return a - wtrunc(a / b) * b;
}

/* splitmix64 — native i64, exact. Matches organism_parallel.cpp. */
static inline u64 splitmix64(u64 *s) {
    *s += 0x9E3779B97F4A7C15ULL;
    u64 z = *s;
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static inline double next_phase(u64 *s) {
    u64 top53 = splitmix64(s) >> 11;             /* 53-bit integer         */
    double unit = (double)top53 * (1.0 / 9007199254740992.0); /* /2^53     */
    return unit * TWO_PI;
}

/* Two scratch buffers in linear memory for the ping-pong phase arrays.
 * Fixed capacity keeps the module malloc-free; callers must respect the
 * limit (returned by kernel_max_nodes()). */
#define MAX_NODES 4096
static double g_a[MAX_NODES];
static double g_b[MAX_NODES];

int kernel_max_nodes(void) { return MAX_NODES; }

static double simulate_one(int nodes, int steps, double coupling, double dt, u64 seed) {
    if (nodes <= 0) return 0.0;
    if (nodes > MAX_NODES) nodes = MAX_NODES;

    u64 s = seed;
    for (int i = 0; i < nodes; ++i) g_a[i] = next_phase(&s);

    double *cur = g_a, *nxt = g_b;
    for (int step = 0; step < steps; ++step) {
        double sum_cos = 0.0, sum_sin = 0.0;
        for (int i = 0; i < nodes; ++i) { sum_cos += cos(cur[i]); sum_sin += sin(cur[i]); }
        sum_cos /= (double)nodes;
        sum_sin /= (double)nodes;
        double r = wsqrt(sum_cos * sum_cos + sum_sin * sum_sin);
        double psi = atan2(sum_sin, sum_cos);

        for (int i = 0; i < nodes; ++i) {
            double theta = cur[i];
            double v = wfmod(theta + coupling * r * sin(psi - theta) * dt, TWO_PI);
            if (v < 0.0) v += TWO_PI;
            nxt[i] = v;
        }
        double *tmp = cur; cur = nxt; nxt = tmp;
    }

    double sum_cos = 0.0, sum_sin = 0.0;
    for (int i = 0; i < nodes; ++i) { sum_cos += cos(cur[i]); sum_sin += sin(cur[i]); }
    sum_cos /= (double)nodes;
    sum_sin /= (double)nodes;
    return wsqrt(sum_cos * sum_cos + sum_sin * sum_sin);
}

/**
 * Compute global population range [begin, end), writing (end-begin)
 * doubles to `out` (a byte offset into linear memory the host reads).
 * Population p is seeded from base_seed + p (the mesh's global-seed
 * convention). Returns the number of populations written.
 */
int simulate_range(int begin, int end, int nodes, int steps,
                   double coupling, double dt, u64 base_seed, double *out) {
    int n = 0;
    for (int p = begin; p < end; ++p) {
        out[n++] = simulate_one(nodes, steps, coupling, dt, base_seed + (u64)p);
    }
    return n;
}
