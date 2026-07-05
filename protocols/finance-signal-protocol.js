/**
 * PROTO-FIN-001: Finance Signal Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Phi-encoded signal processing for financial market data.
 * Transforms raw price/volume/sentiment streams into scored trading signals
 * using the organism's golden-ratio signal processing framework.
 *
 * Signal quality tiers (Kuramoto-derived):
 *   R ≥ 0.87  → SOVEREIGN  — strong consensus across indicators
 *   R ≥ 0.618 → COHERENT   — usable signal with mild noise
 *   R < 0.618 → CHAOTIC    — suppress or discard
 *
 * Phi-decay is used for signal half-life: recent signals weight more.
 * The golden angle (137.5°) seeds momentum angle calculations.
 */

'use strict';

const PHI            = 1.618033988749895;
const PHI_INV        = 0.618033988749895;
const GOLDEN_ANGLE   = 137.5077640500378;
const HEARTBEAT_MS   = 873;

const SIGNAL_TIER = Object.freeze({
  SOVEREIGN: 'sovereign',
  COHERENT:  'coherent',
  CHAOTIC:   'chaotic',
});

const DIRECTION = Object.freeze({ LONG: 'long', SHORT: 'short', FLAT: 'flat' });

/**
 * Phi-weighted exponential moving average.
 * Recent samples weight by PHI^0; older by PHI^-1, PHI^-2, ...
 */
function phiEMA(series) {
  if (!series.length) return 0;
  let num = 0, den = 0;
  for (let i = 0; i < series.length; i++) {
    const w = Math.pow(PHI_INV, i);
    num += series[series.length - 1 - i] * w;
    den += w;
  }
  return num / den;
}

/**
 * Compute the phi-normalized order parameter R across an array of signal
 * strengths (values in [-1,1]). Converts to phases and applies the
 * Kuramoto formula: R = |1/N Σ e^(iθ)|.
 */
function signalCoherence(signals) {
  if (!signals.length) return 0;
  let re = 0, im = 0;
  for (const s of signals) {
    const theta = s * Math.PI;      // map [-1,1] → [-π, π]
    re += Math.cos(theta);
    im += Math.sin(theta);
  }
  return Math.sqrt((re/signals.length)**2 + (im/signals.length)**2);
}

function signalTier(r) {
  if (r >= 0.87)   return SIGNAL_TIER.SOVEREIGN;
  if (r >= PHI_INV) return SIGNAL_TIER.COHERENT;
  return SIGNAL_TIER.CHAOTIC;
}

class FinanceSignalProcessor {
  constructor(symbol, halfLifeBars = 14) {
    this.symbol     = symbol;
    this.halfLifeBars = halfLifeBars;
    this._prices    = [];
    this._volumes   = [];
    this._signals   = [];
    this._beat      = 0;
  }

  /** Ingest a new OHLCV bar. */
  ingest({ open, high, low, close, volume, ts = Date.now() }) {
    this._prices.push({ open, high, low, close, ts });
    this._volumes.push(volume);
    this._beat++;
    return this._compute();
  }

  _compute() {
    const prices  = this._prices;
    const n       = prices.length;
    if (n < 2) return null;

    const closes  = prices.map(p => p.close);
    const pricePhi = phiEMA(closes);

    // Momentum: ratio of close to phi-EMA, normalised to [-1,1]
    const last   = closes[closes.length - 1];
    const momentum = Math.tanh((last - pricePhi) / (pricePhi + 1e-9));

    // Volume pressure: is recent volume above phi-EMA of volume?
    const vols = this._volumes;
    const volPhi = phiEMA(vols);
    const volPressure = Math.tanh((vols[vols.length - 1] - volPhi) / (volPhi + 1e-9));

    // Phi-range oscillator: position within high-low range [0,1]
    const recent = prices.slice(-Math.min(n, 14));
    const highest = Math.max(...recent.map(p => p.high));
    const lowest  = Math.min(...recent.map(p => p.low));
    const range   = highest - lowest || 1;
    const rangeOsc = (last - lowest) / range * 2 - 1;   // normalise [-1,1]

    // Composite signal
    const composite = momentum * PHI_INV + rangeOsc * (1 - PHI_INV) + volPressure * 0.1;
    const clamped   = Math.max(-1, Math.min(1, composite));

    // Push to signal history
    this._signals.push(clamped);
    if (this._signals.length > 50) this._signals.shift();

    const r        = signalCoherence(this._signals.slice(-20));
    const tier     = signalTier(r);
    const direction = clamped > 0.05 ? DIRECTION.LONG
                    : clamped < -0.05 ? DIRECTION.SHORT
                    : DIRECTION.FLAT;

    return {
      symbol:     this.symbol,
      beat:       this._beat,
      close:      last,
      signal:     parseFloat(clamped.toFixed(4)),
      direction,
      coherence:  parseFloat(r.toFixed(4)),
      tier,
      momentum:   parseFloat(momentum.toFixed(4)),
      volPressure: parseFloat(volPressure.toFixed(4)),
      rangeOsc:   parseFloat(rangeOsc.toFixed(4)),
      phiEMA:     parseFloat(pricePhi.toFixed(4)),
    };
  }

  latestSignal() { return this._signals[this._signals.length - 1] ?? 0; }

  snapshot() {
    return {
      symbol:       this.symbol,
      beat:         this._beat,
      barsIngested: this._prices.length,
      coherence:    parseFloat(signalCoherence(this._signals.slice(-20)).toFixed(4)),
      latestSignal: parseFloat(this.latestSignal().toFixed(4)),
    };
  }
}

module.exports = {
  FinanceSignalProcessor, phiEMA, signalCoherence, signalTier,
  SIGNAL_TIER, DIRECTION, PHI, PHI_INV, GOLDEN_ANGLE,
};
