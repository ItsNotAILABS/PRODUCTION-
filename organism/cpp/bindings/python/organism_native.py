"""
ctypes binding for liborganism_native — the compiled C++ organism runtime,
called through organism_c_api.h's stable C ABI.

Exposes the same physics primitives as organism.python's organism.physics
module (order_parameter, mean_field_kuramoto_step, phi_decay) plus the
stateful register/heartbeat runtime, backed by compiled C++ instead of
interpreted Python — useful when a hot loop (many oscillators, many
steps) needs to run faster than pure Python allows, while staying
numerically identical to the reference implementation.

Numerical parity with organism.python.organism.physics is enforced by
test_parity.py in this directory, not just asserted in a docstring.

Usage:
    from organism_native import NativeEngine
    engine = NativeEngine()  # loads liborganism_native.so automatically
    r, psi = engine.order_parameter([0.1, 0.5, 1.2])
    next_phases = engine.mean_field_step([0.1, 0.5, 1.2], [1.0, 1.0, 1.0], coupling=0.618, dt=0.873)
"""
from __future__ import annotations

import ctypes
import os
import platform
from typing import Callable, Sequence


class RegisterState(ctypes.Structure):
    """Mirrors organism_register_state_t — plain C struct, safe to pass by value."""
    _fields_ = [
        ("reasoning", ctypes.c_double), ("planning", ctypes.c_double), ("analysis", ctypes.c_double),
        ("emotion", ctypes.c_double), ("mood", ctypes.c_double), ("sentiment", ctypes.c_double),
        ("energy", ctypes.c_double), ("tension", ctypes.c_double), ("rhythm", ctypes.c_double),
        ("autonomy", ctypes.c_double), ("coherence", ctypes.c_double), ("integrity", ctypes.c_double),
    ]


# organism_register_t enum values (must match organism_c_api.h)
REGISTER_COGNITIVE = 0
REGISTER_AFFECTIVE = 1
REGISTER_SOMATIC = 2
REGISTER_SOVEREIGN = 3

BeatCallback = Callable[[int], None]
_BEAT_CALLBACK_CTYPE = ctypes.CFUNCTYPE(None, ctypes.c_uint64, ctypes.c_void_p)


def _default_library_name() -> str:
    system = platform.system()
    if system == "Darwin":
        return "liborganism_native.dylib"
    if system == "Windows":
        return "organism_native.dll"
    return "liborganism_native.so"


def _find_library(explicit_path: str | None) -> str:
    if explicit_path:
        if not os.path.isfile(explicit_path):
            raise FileNotFoundError(f"organism_native library not found at {explicit_path}")
        return explicit_path

    name = _default_library_name()
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(here, "..", "..", "build", name),          # cmake -B build (default, from repo root)
        os.path.join(here, "..", "..", "build", "lib", name),
        os.path.join(here, name),
        name,  # let the OS loader search LD_LIBRARY_PATH / rpath
    ]
    for c in candidates:
        c = os.path.normpath(c)
        if os.path.isfile(c):
            return c
    raise FileNotFoundError(
        f"Could not locate {name}. Build it first:\n"
        f"  cd organism/cpp && cmake -B build . && cmake --build build --target organism_native\n"
        f"Or pass an explicit path: NativeEngine(library_path=...)"
    )


class NativeEngine:
    """Thin ctypes wrapper around liborganism_native's C API."""

    def __init__(self, library_path: str | None = None) -> None:
        path = _find_library(library_path)
        self._lib = ctypes.CDLL(path)
        self._path = path
        self._configure_signatures()

    def _configure_signatures(self) -> None:
        lib = self._lib

        lib.organism_version.restype = ctypes.c_char_p
        lib.organism_phi.restype = ctypes.c_double
        lib.organism_golden_angle.restype = ctypes.c_double
        lib.organism_heartbeat_ms.restype = ctypes.c_int

        lib.organism_order_parameter.argtypes = [
            ctypes.POINTER(ctypes.c_double), ctypes.c_size_t,
            ctypes.POINTER(ctypes.c_double), ctypes.POINTER(ctypes.c_double),
        ]
        lib.organism_order_parameter.restype = None

        lib.organism_mean_field_step.argtypes = [
            ctypes.POINTER(ctypes.c_double), ctypes.POINTER(ctypes.c_double), ctypes.c_size_t,
            ctypes.c_double, ctypes.c_double, ctypes.POINTER(ctypes.c_double),
        ]
        lib.organism_mean_field_step.restype = None

        lib.organism_phi_decay.argtypes = [ctypes.c_double, ctypes.c_double, ctypes.c_double]
        lib.organism_phi_decay.restype = ctypes.c_double

        lib.organism_register_state_default.restype = RegisterState
        lib.organism_register_phi_score.argtypes = [ctypes.POINTER(RegisterState)]
        lib.organism_register_phi_score.restype = ctypes.c_double

        lib.organism_state_create.restype = ctypes.c_void_p
        lib.organism_state_destroy.argtypes = [ctypes.c_void_p]
        lib.organism_state_set_register.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(RegisterState)]
        lib.organism_state_get_register.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(RegisterState)]
        lib.organism_state_beat_count.argtypes = [ctypes.c_void_p]
        lib.organism_state_beat_count.restype = ctypes.c_uint64
        lib.organism_state_vitality.argtypes = [ctypes.c_void_p]
        lib.organism_state_vitality.restype = ctypes.c_double

        lib.organism_heartbeat_create.argtypes = [ctypes.c_void_p]
        lib.organism_heartbeat_create.restype = ctypes.c_void_p
        lib.organism_heartbeat_destroy.argtypes = [ctypes.c_void_p]
        lib.organism_heartbeat_start.argtypes = [ctypes.c_void_p]
        lib.organism_heartbeat_stop.argtypes = [ctypes.c_void_p]
        lib.organism_heartbeat_on_beat.argtypes = [ctypes.c_void_p, _BEAT_CALLBACK_CTYPE, ctypes.c_void_p]
        lib.organism_heartbeat_count.argtypes = [ctypes.c_void_p]
        lib.organism_heartbeat_count.restype = ctypes.c_uint64

    @property
    def library_path(self) -> str:
        return self._path

    def version(self) -> str:
        return self._lib.organism_version().decode("ascii")

    @property
    def phi(self) -> float:
        return self._lib.organism_phi()

    @property
    def golden_angle(self) -> float:
        return self._lib.organism_golden_angle()

    @property
    def heartbeat_ms(self) -> int:
        return self._lib.organism_heartbeat_ms()

    def order_parameter(self, phases: Sequence[float]) -> tuple[float, float]:
        n = len(phases)
        arr = (ctypes.c_double * n)(*phases)
        out_r = ctypes.c_double()
        out_psi = ctypes.c_double()
        self._lib.organism_order_parameter(arr, n, ctypes.byref(out_r), ctypes.byref(out_psi))
        return out_r.value, out_psi.value

    def mean_field_step(
        self, phases: Sequence[float], activities: Sequence[float], coupling: float, dt: float,
    ) -> list[float]:
        n = len(phases)
        if len(activities) != n:
            raise ValueError("phases and activities must be the same length")
        phases_arr = (ctypes.c_double * n)(*phases)
        activities_arr = (ctypes.c_double * n)(*activities)
        out_arr = (ctypes.c_double * n)()
        self._lib.organism_mean_field_step(phases_arr, activities_arr, n, coupling, dt, out_arr)
        return list(out_arr)

    def phi_decay(self, initial: float, age_s: float, half_life_s: float = -1.0) -> float:
        return self._lib.organism_phi_decay(initial, age_s, half_life_s)

    def default_register(self) -> RegisterState:
        return self._lib.organism_register_state_default()

    def register_phi_score(self, state: RegisterState) -> float:
        return self._lib.organism_register_phi_score(ctypes.byref(state))

    def create_state(self) -> "NativeState":
        return NativeState(self._lib)


class NativeState:
    """Wraps organism_state_t — the four-register phi-weighted state machine.
    Always `close()` it (or use as a context manager) to free the C++ object."""

    def __init__(self, lib: ctypes.CDLL) -> None:
        self._lib = lib
        self._handle = lib.organism_state_create()
        self._heartbeat: "NativeHeartbeat | None" = None

    def set_register(self, register: int, state: RegisterState) -> None:
        self._lib.organism_state_set_register(self._handle, register, ctypes.byref(state))

    def get_register(self, register: int) -> RegisterState:
        out = RegisterState()
        self._lib.organism_state_get_register(self._handle, register, ctypes.byref(out))
        return out

    @property
    def beat_count(self) -> int:
        return self._lib.organism_state_beat_count(self._handle)

    @property
    def vitality(self) -> float:
        return self._lib.organism_state_vitality(self._handle)

    def heartbeat(self) -> "NativeHeartbeat":
        if self._heartbeat is None:
            self._heartbeat = NativeHeartbeat(self._lib, self._handle)
        return self._heartbeat

    def close(self) -> None:
        if self._heartbeat is not None:
            self._heartbeat.close()
            self._heartbeat = None
        if self._handle:
            self._lib.organism_state_destroy(self._handle)
            self._handle = None

    def __enter__(self) -> "NativeState":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass


class NativeHeartbeat:
    """Wraps organism_heartbeat_t — the background 873ms tick thread bound to a NativeState."""

    def __init__(self, lib: ctypes.CDLL, state_handle) -> None:
        self._lib = lib
        self._handle = lib.organism_heartbeat_create(state_handle)
        self._callbacks: list[_BEAT_CALLBACK_CTYPE] = []  # keep refs alive — ctypes won't

    def on_beat(self, fn: BeatCallback) -> None:
        """Register a Python callback fired on every beat. Call before start()."""
        def trampoline(beat_count: int, _user_data) -> None:
            fn(beat_count)
        c_cb = _BEAT_CALLBACK_CTYPE(trampoline)
        self._callbacks.append(c_cb)  # prevent garbage collection while the C side holds it
        self._lib.organism_heartbeat_on_beat(self._handle, c_cb, None)

    def start(self) -> None:
        self._lib.organism_heartbeat_start(self._handle)

    def stop(self) -> None:
        self._lib.organism_heartbeat_stop(self._handle)

    @property
    def count(self) -> int:
        return self._lib.organism_heartbeat_count(self._handle)

    def close(self) -> None:
        if self._handle:
            self.stop()
            self._lib.organism_heartbeat_destroy(self._handle)
            self._handle = None

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass


if __name__ == "__main__":
    engine = NativeEngine()
    print(f"organism_native v{engine.version()} loaded from {engine.library_path}")
    print(f"PHI={engine.phi}  GOLDEN_ANGLE={engine.golden_angle}  HEARTBEAT_MS={engine.heartbeat_ms}")
    r, psi = engine.order_parameter([0.0, 0.1, 0.2, 0.3])
    print(f"order_parameter([0.0,0.1,0.2,0.3]) = R={r:.6f}, psi={psi:.6f}")
