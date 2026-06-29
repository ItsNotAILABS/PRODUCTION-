/**
 * PROTO-I015: Shipping Intelligence Protocol (SIP)
 * Derives from: SupplyChainProtocol, PricingOptimizationProtocol
 * Shipping rate optimization with phi-weighted cost*time scoring and carrier selection.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class ShippingIntelligenceProtocol {
  #carriers = new Map(); // name → { rateTable, transitDays }

  constructor(config = {}) {
    this.version    = '1.0.0';
    this.domain     = 'integrations';
    this.weightUnit = config.weightUnit ?? 'kg';
    this.metrics    = { quotes: 0, selections: 0, carriers: 0 };
  }

  /** Register a carrier with a rate table and transit time map. */
  registerCarrier(name, { rateTable = [], transitDays = {} } = {}) {
    this.#carriers.set(name, { rateTable, transitDays });
    this.metrics.carriers = this.#carriers.size;
    return { carrier: name, rates: rateTable.length };
  }

  /** Quote all carriers for a shipment. Returns ranked options by phi-weighted score. */
  quote(origin, destination, weight, dimensions = {}) {
    const quotes = [];
    for (const [carrier, info] of this.#carriers) {
      const rate    = this.#calcRate(info.rateTable, weight, dimensions);
      const days    = this.#getTransit(info.transitDays, origin, destination);
      const score   = this.#phiScore(rate, days);
      quotes.push({ carrier, rate, transitDays: days, score, origin, destination, weight });
    }
    quotes.sort((a, b) => b.score - a.score); // highest score = best value
    this.metrics.quotes++;
    return quotes;
  }

  /** Select the optimal quote satisfying max time and cost constraints. */
  selectOptimal(quotes = [], { maxDays = Infinity, maxCost = Infinity } = {}) {
    const eligible = quotes.filter((q) => q.transitDays <= maxDays && q.rate <= maxCost);
    if (!eligible.length) return null;
    const best = eligible.reduce((a, b) => (a.score > b.score ? a : b));
    this.metrics.selections++;
    return best;
  }

  /** Estimate delivery date for a carrier on a route. */
  estimateDelivery(carrier, origin, destination) {
    const info = this.#carriers.get(carrier);
    if (!info) throw new Error(`Carrier not registered: ${carrier}`);
    const days   = this.#getTransit(info.transitDays, origin, destination);
    const delivery = new Date(Date.now() + days * 86_400_000);
    return { carrier, origin, destination, transitDays: days, estimatedDelivery: delivery.toISOString().slice(0, 10) };
  }

  #calcRate(rateTable, weight, { volume = 0 } = {}) {
    if (!rateTable.length) return weight * PHI; // fallback: phi per kg
    const bracket = rateTable
      .filter((r) => weight >= (r.minKg ?? 0) && weight <= (r.maxKg ?? Infinity))
      .sort((a, b) => a.minKg - b.minKg)[0];
    if (!bracket) return weight * PHI;
    const base   = bracket.baseRate ?? 0;
    const perKg  = bracket.perKg   ?? 0;
    const volSurcharge = volume > 0 ? volume * (bracket.perCbm ?? 0) : 0;
    return parseFloat((base + weight * perKg + volSurcharge).toFixed(4));
  }

  #getTransit(transitDays, origin, destination) {
    return transitDays[`${origin}-${destination}`]
      ?? transitDays[`${destination}-${origin}`]
      ?? transitDays.default
      ?? Math.ceil(PHI * 3); // ~5 day fallback
  }

  /** phi-weighted score: lower cost and fewer days = higher score. */
  #phiScore(rate, days) {
    const costFactor = 1 / (rate * PHI_INV + 1);
    const timeFactor = 1 / (days * PHI_INV + 1);
    return parseFloat((costFactor * PHI + timeFactor * PHI_INV).toFixed(6));
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default ShippingIntelligenceProtocol;
