/**
 * @auro/geometry-lock — Main Index
 *
 * Geometry Lock SDK and Nova Protocol Bridge.
 *
 * Provides phi-resonance access gating for sovereign organism calls.
 * External partners (Nova protocol, Google AI) present a geometric key token
 * derived from a shared secret and the current heartbeat time window.
 * Access is granted only when the token's phase vector resonates with the
 * organism's expected envelope (Kuramoto R > φ⁻¹ = 0.618).
 *
 * EXPORTS:
 *   GeometryLockSDK  — callable surface (generateKey, validateKey, registerCaller, revokeKey)
 *   GeometryBridge   — adapter gating sdk/medina-calls/ behind the lock
 *   KEY_STATES       — key lifecycle state constants
 *   ACCESS           — access decision constants ('granted' | 'denied')
 *   CONTRACT_STATE   — bridge contract lifecycle constants
 *   WINDOW_MS        — time window duration in ms (HEARTBEAT × φ ≈ 1411ms)
 */

export { GeometryLockSDK, KEY_STATES, ACCESS, WINDOW_MS } from './geometry-lock-sdk.js';
export { GeometryBridge, CONTRACT_STATE } from './geometry-bridge.js';
