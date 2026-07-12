/**
 * test_c_api.c — pure-C exercise of organism_c_api.h.
 *
 * Deliberately written in C, not C++: proves the shared library's public
 * interface is a real C ABI, not just "compiles under a C++ compiler
 * with extern C sprinkled on top." Compile with a C compiler:
 *
 *   gcc -std=c11 -I../include test_c_api.c -L../build -lorganism_native \
 *       -Wl,-rpath,../build -o test_c_api
 *   ./test_c_api
 *
 * Or run under valgrind for a memory-safety check on the C++
 * implementation behind the C interface:
 *
 *   valgrind --leak-check=full --error-exitcode=1 ./test_c_api
 */
#define _POSIX_C_SOURCE 199309L /* for nanosleep() under strict -std=c11 */

#include "organism_c_api.h"

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

static int g_failures = 0;

#define CHECK(label, cond) do { \
    if (cond) { printf("PASS: %s\n", label); } \
    else      { printf("FAIL: %s\n", label); g_failures++; } \
} while (0)

static volatile uint64_t g_beats_seen = 0;

static void on_beat(uint64_t beat_count, void* user_data) {
    (void)user_data;
    g_beats_seen = beat_count;
}

int main(void) {
    printf("organism_native C API version: %s\n", organism_version());
    printf("PHI=%.15f  GOLDEN_ANGLE=%.3f  HEARTBEAT_MS=%d\n\n",
           organism_phi(), organism_golden_angle(), organism_heartbeat_ms());

    CHECK("version string is non-empty", strlen(organism_version()) > 0);
    CHECK("PHI matches the known constant", fabs(organism_phi() - 1.618033988749895) < 1e-12);
    CHECK("HEARTBEAT_MS is 873", organism_heartbeat_ms() == 873);

    /* -- pure physics: order_parameter ---------------------------------- */
    double phases[4] = {0.0, 0.1, 0.2, 0.3};
    double r = -1.0, psi = -999.0;
    organism_order_parameter(phases, 4, &r, &psi);
    CHECK("order_parameter R is in [0,1]", r >= 0.0 && r <= 1.0);
    printf("  order_parameter -> R=%.6f psi=%.6f\n\n", r, psi);

    /* -- pure physics: mean_field_step ----------------------------------- */
    double activities[4] = {1.0, 1.0, 1.0, 1.0};
    double next_phases[4];
    organism_mean_field_step(phases, activities, 4, 0.618033988749895, 0.873, next_phases);
    CHECK("mean_field_step produced finite outputs",
          isfinite(next_phases[0]) && isfinite(next_phases[1]) &&
          isfinite(next_phases[2]) && isfinite(next_phases[3]));

    /* -- pure physics: phi_decay ------------------------------------------ */
    double decayed = organism_phi_decay(1.0, 137.508, -1.0);
    CHECK("phi_decay produced a value less than the input", decayed < 1.0 && decayed > 0.0);

    /* -- stateful: register set/get round-trip --------------------------- */
    organism_state_t* state = organism_state_create();
    CHECK("organism_state_create returned non-NULL", state != NULL);

    organism_register_state_t sov = organism_register_state_default();
    sov.coherence = 0.87;
    sov.integrity = 0.95;
    organism_state_set_register(state, ORGANISM_REGISTER_SOVEREIGN, &sov);

    organism_register_state_t readback;
    organism_state_get_register(state, ORGANISM_REGISTER_SOVEREIGN, &readback);
    CHECK("register round-trips through set/get", readback.coherence == 0.87 && readback.integrity == 0.95);

    double vitality = organism_state_vitality(state);
    CHECK("vitality is finite and non-negative", isfinite(vitality) && vitality >= 0.0);
    printf("  vitality=%.6f\n\n", vitality);

    /* -- stateful: heartbeat, real background thread, real callback ------ */
    organism_heartbeat_t* hb = organism_heartbeat_create(state);
    CHECK("organism_heartbeat_create returned non-NULL", hb != NULL);

    organism_heartbeat_on_beat(hb, on_beat, NULL);
    organism_heartbeat_start(hb);

    struct timespec ts1 = {3, 200000000L}; nanosleep(&ts1, NULL); /* 3.2s — HEARTBEAT_MS=873, expect ~3 beats */

    organism_heartbeat_stop(hb);
    uint64_t final_count = organism_heartbeat_count(hb);

    CHECK("heartbeat produced at least 2 beats in 3.2s", final_count >= 2);
    CHECK("callback's last-seen beat matches heartbeat_count", g_beats_seen == final_count);
    CHECK("state's beat_count reflects the heartbeat", organism_state_beat_count(state) == final_count);
    printf("  final_count=%llu\n\n", (unsigned long long)final_count);

    /* -- confirm stop() actually stops it -------------------------------- */
    struct timespec ts2 = {2, 0}; nanosleep(&ts2, NULL);
    CHECK("no further beats after stop()", organism_heartbeat_count(hb) == final_count);

    /* -- cleanup: order matters (heartbeat before state) ------------------ */
    organism_heartbeat_destroy(hb);
    organism_state_destroy(state);

    printf("\n");
    if (g_failures > 0) {
        printf("RESULT: %d check(s) FAILED\n", g_failures);
        return 1;
    }
    printf("RESULT: all C API checks passed.\n");
    return 0;
}
