#include "organism_c_api.h"
#include "organism.h"

#include <cmath>
#include <cstdio>
#include <cstring>

/* ── Version / constants ────────────────────────────────────────────── */

const char* organism_version(void) {
    static char buf[16];
    std::snprintf(buf, sizeof(buf), "%d.%d.%d",
                  ORGANISM_C_API_VERSION_MAJOR, ORGANISM_C_API_VERSION_MINOR, ORGANISM_C_API_VERSION_PATCH);
    return buf;
}

double organism_phi(void)          { return organism::PHI; }
double organism_golden_angle(void) { return organism::GOLDEN_ANGLE; }
int    organism_heartbeat_ms(void) { return organism::HEARTBEAT_MS; }

/* ── Pure physics primitives — mirror organism/python/organism/physics.py ── */

void organism_order_parameter(const double* phases, size_t count,
                               double* out_r, double* out_psi) {
    if (count == 0) {
        if (out_r) *out_r = 0.0;
        if (out_psi) *out_psi = 0.0;
        return;
    }
    double sum_cos = 0.0, sum_sin = 0.0;
    for (size_t i = 0; i < count; ++i) {
        sum_cos += std::cos(phases[i]);
        sum_sin += std::sin(phases[i]);
    }
    sum_cos /= static_cast<double>(count);
    sum_sin /= static_cast<double>(count);
    if (out_r)   *out_r   = std::hypot(sum_cos, sum_sin);
    if (out_psi) *out_psi = std::atan2(sum_sin, sum_cos);
}

void organism_mean_field_step(const double* phases, const double* activities,
                               size_t count, double coupling, double dt,
                               double* out_next_phases) {
    double r, psi;
    organism_order_parameter(phases, count, &r, &psi);

    const double two_pi = 2.0 * M_PI;
    for (size_t i = 0; i < count; ++i) {
        double theta = phases[i];
        double activity = activities ? activities[i] : 1.0;
        double force = coupling * r * std::sin(psi - theta);
        double next = std::fmod(theta + force * dt * activity, two_pi);
        if (next < 0.0) next += two_pi;
        out_next_phases[i] = next;
    }
}

double organism_phi_decay(double initial, double age_s, double half_life_s) {
    if (half_life_s <= 0.0) half_life_s = organism::GOLDEN_ANGLE;
    return initial / (1.0 + std::pow(age_s / half_life_s, 1.0 / organism::PHI));
}

/* ── Register state ─────────────────────────────────────────────────── */

organism_register_state_t organism_register_state_default(void) {
    organism_register_state_t s{};
    s.reasoning = s.planning = s.analysis = 0.0;
    s.emotion = s.mood = s.sentiment = 0.0;
    s.energy = 1.0; s.tension = 0.0; s.rhythm = 0.0;
    s.autonomy = 1.0; s.coherence = 1.0; s.integrity = 1.0;
    return s;
}

static organism::RegisterState toCpp(const organism_register_state_t* c) {
    organism::RegisterState r;
    r.reasoning = c->reasoning; r.planning = c->planning; r.analysis = c->analysis;
    r.emotion = c->emotion; r.mood = c->mood; r.sentiment = c->sentiment;
    r.energy = c->energy; r.tension = c->tension; r.rhythm = c->rhythm;
    r.autonomy = c->autonomy; r.coherence = c->coherence; r.integrity = c->integrity;
    return r;
}

static void fromCpp(const organism::RegisterState& r, organism_register_state_t* out) {
    out->reasoning = r.reasoning; out->planning = r.planning; out->analysis = r.analysis;
    out->emotion = r.emotion; out->mood = r.mood; out->sentiment = r.sentiment;
    out->energy = r.energy; out->tension = r.tension; out->rhythm = r.rhythm;
    out->autonomy = r.autonomy; out->coherence = r.coherence; out->integrity = r.integrity;
}

double organism_register_phi_score(const organism_register_state_t* state) {
    if (!state) return 0.0;
    return toCpp(state).phiWeightedScore();
}

static organism::Register toCppRegister(organism_register_t r) {
    switch (r) {
        case ORGANISM_REGISTER_COGNITIVE: return organism::Register::Cognitive;
        case ORGANISM_REGISTER_AFFECTIVE: return organism::Register::Affective;
        case ORGANISM_REGISTER_SOMATIC:   return organism::Register::Somatic;
        case ORGANISM_REGISTER_SOVEREIGN: return organism::Register::Sovereign;
    }
    return organism::Register::Cognitive;
}

/* ── Opaque state handle ────────────────────────────────────────────── */

struct organism_state_s {
    organism::OrganismState impl;
};

organism_state_t* organism_state_create(void) {
    return new organism_state_s();
}

void organism_state_destroy(organism_state_t* state) {
    delete state;
}

void organism_state_set_register(organism_state_t* state, organism_register_t reg,
                                  const organism_register_state_t* value) {
    if (!state || !value) return;
    state->impl.setRegister(toCppRegister(reg), toCpp(value));
}

void organism_state_get_register(const organism_state_t* state, organism_register_t reg,
                                  organism_register_state_t* out_value) {
    if (!state || !out_value) return;
    fromCpp(state->impl.getRegister(toCppRegister(reg)), out_value);
}

uint64_t organism_state_beat_count(const organism_state_t* state) {
    if (!state) return 0;
    return state->impl.snapshot().beatCount;
}

double organism_state_vitality(const organism_state_t* state) {
    if (!state) return 0.0;
    organism::EdgeSensor emptySensors;
    return organism::VitalityCalculator::score(state->impl.snapshot(), emptySensors);
}

/* ── Opaque heartbeat handle ────────────────────────────────────────── */

struct organism_heartbeat_s {
    organism::Heartbeat impl;
    explicit organism_heartbeat_s(organism::OrganismState& state) : impl(state) {}
};

organism_heartbeat_t* organism_heartbeat_create(organism_state_t* state) {
    if (!state) return nullptr;
    return new organism_heartbeat_s(state->impl);
}

void organism_heartbeat_destroy(organism_heartbeat_t* hb) {
    delete hb; /* Heartbeat's destructor calls stop() */
}

void organism_heartbeat_start(organism_heartbeat_t* hb) {
    if (hb) hb->impl.start();
}

void organism_heartbeat_stop(organism_heartbeat_t* hb) {
    if (hb) hb->impl.stop();
}

void organism_heartbeat_on_beat(organism_heartbeat_t* hb, organism_beat_callback_t cb, void* user_data) {
    if (!hb || !cb) return;
    hb->impl.onBeat([cb, user_data](uint64_t beat) {
        cb(beat, user_data);
    });
}

uint64_t organism_heartbeat_count(const organism_heartbeat_t* hb) {
    if (!hb) return 0;
    return hb->impl.count();
}
