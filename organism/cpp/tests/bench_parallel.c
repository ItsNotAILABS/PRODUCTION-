/**
 * bench_parallel.c — correctness + speedup benchmark for the parallel
 * batch simulation engine (organism_batch_simulate).
 *
 * Prints, for 1..hardware_threads workers, the wall-clock time to run a
 * fixed batch and the speedup vs. the 1-thread baseline. Also asserts the
 * results are BIT-IDENTICAL across thread counts — the correctness
 * guarantee that makes the speedup meaningful (a faster wrong answer
 * isn't a supercomputer).
 *
 * Build (via CMake): produced as the `bench_parallel` target.
 * Run: LD_LIBRARY_PATH=build ./build/bench_parallel
 */
#define _POSIX_C_SOURCE 199309L

#include "organism_c_api.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static double now_seconds(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec + (double)ts.tv_nsec * 1e-9;
}

int main(void) {
    const size_t POPULATIONS = 6000;   /* independent connectomes         */
    const size_t NODES = 512;          /* oscillators per connectome      */
    const size_t STEPS = 20;           /* mean-field steps per connectome  */
    /* Moderate coupling and a short horizon so populations are caught
     * mid-convergence at a SPREAD of partial-coherence values rather than
     * all saturating to R=1 — makes the batch visibly a real distribution
     * of independent results, not one number repeated. (This model has no
     * natural-frequency disorder, so any positive coupling fully
     * synchronizes given enough steps — the spread comes from the finite
     * horizon.) */
    const double COUPLING = 0.35;
    const double DT = 0.873;
    const uint64_t SEED = 20260101ULL;

    const int hw = organism_hardware_threads();
    printf("organism batch-simulate benchmark\n");
    printf("  hardware threads : %d\n", hw);
    printf("  populations      : %zu\n", POPULATIONS);
    printf("  nodes/pop        : %zu\n", NODES);
    printf("  steps/pop        : %zu\n", STEPS);
    printf("  total node-steps : %.3g\n\n",
           (double)POPULATIONS * (double)NODES * (double)STEPS);

    double* baseline = malloc(POPULATIONS * sizeof(double));
    double* result = malloc(POPULATIONS * sizeof(double));
    if (!baseline || !result) { fprintf(stderr, "OOM\n"); return 1; }

    /* 1-thread baseline (also captures the reference results) */
    double t0 = now_seconds();
    organism_batch_simulate(POPULATIONS, NODES, STEPS, COUPLING, DT, SEED, 1, baseline);
    double base_time = now_seconds() - t0;

    printf("  threads   time(s)   speedup   node-steps/s   results-match\n");
    printf("  -------   -------   -------   ------------   -------------\n");
    printf("  %5d   %7.3f   %6.2fx   %.3e   (baseline)\n",
           1, base_time, 1.0,
           (double)POPULATIONS * NODES * STEPS / base_time);

    int all_match = 1;
    for (int threads = 2; threads <= hw; ++threads) {
        double s0 = now_seconds();
        organism_batch_simulate(POPULATIONS, NODES, STEPS, COUPLING, DT, SEED, threads, result);
        double elapsed = now_seconds() - s0;

        /* Correctness: multi-threaded result must equal the 1-thread result exactly. */
        int match = (memcmp(baseline, result, POPULATIONS * sizeof(double)) == 0);
        if (!match) all_match = 0;

        printf("  %5d   %7.3f   %6.2fx   %.3e   %s\n",
               threads, elapsed, base_time / elapsed,
               (double)POPULATIONS * NODES * STEPS / elapsed,
               match ? "identical" : "*** MISMATCH ***");
    }

    /* Show the batch is a real distribution of independent results, not a
     * constant repeated POPULATIONS times. */
    double mn = baseline[0], mx = baseline[0], sum = 0.0;
    for (size_t i = 0; i < POPULATIONS; ++i) {
        if (baseline[i] < mn) mn = baseline[i];
        if (baseline[i] > mx) mx = baseline[i];
        sum += baseline[i];
    }
    printf("\n");
    printf("  coherence across %zu independent runs: min=%.4f  mean=%.4f  max=%.4f\n",
           POPULATIONS, mn, sum / (double)POPULATIONS, mx);
    printf("\n");

    free(baseline);
    free(result);

    if (!all_match) {
        printf("RESULT: FAIL — parallel results diverged from the single-thread baseline.\n");
        return 1;
    }
    printf("RESULT: PASS — identical results across all thread counts; speedup is real work, not a wrong answer.\n");
    return 0;
}
