/**
 * PROTO-I018: Order Routing Protocol (ORP)
 * Derives from: SupplyChainProtocol, ShippingIntelligenceProtocol
 * Intelligent order routing with phi-weighted (cost, capacity, proximity) scoring.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class OrderRoutingProtocol {
  #centers = new Map(); // id → { platforms[], capacity, zones[], costPerOrder, currentLoad }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.metrics  = { routed: 0, split: 0, centers: 0, avgCost: 0 };
  }

  /** Register a fulfillment center. */
  registerFulfillmentCenter(id, { platforms = [], capacity = 100, zones = [], costPerOrder = 5 } = {}) {
    this.#centers.set(id, { platforms, capacity, zones, costPerOrder, currentLoad: 0 });
    this.metrics.centers = this.#centers.size;
    return { id, capacity, zones, costPerOrder };
  }

  /** Route an order to the optimal fulfillment center. */
  route(order) {
    const candidates = this.#getCandidates(order);
    if (!candidates.length) throw new Error('No fulfillment center available for this order');

    const scored  = candidates.map((id) => ({ id, score: this.#score(id, order) }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const center = this.#centers.get(best.id);
    center.currentLoad++;

    this.#updateAvgCost(center.costPerOrder);
    this.metrics.routed++;
    return {
      orderId: order.id,
      fulfillmentCenter: best.id,
      score:   best.score,
      cost:    center.costPerOrder,
      options: scored,
    };
  }

  /** Split a large order across multiple fulfillment centers by quantity. */
  split(order, centerIds = []) {
    const items = order.items ?? [];
    if (!items.length || !centerIds.length) throw new Error('Order items and centerIds required');

    const perCenter = Math.ceil(items.length / centerIds.length);
    const splits = centerIds.map((id, i) => {
      const chunk = items.slice(i * perCenter, (i + 1) * perCenter);
      const center = this.#centers.get(id);
      if (center) center.currentLoad += chunk.length;
      return { fulfillmentCenter: id, items: chunk, itemCount: chunk.length };
    }).filter((s) => s.itemCount > 0);

    this.metrics.split++;
    return { orderId: order.id, splits, totalCenters: splits.length };
  }

  #getCandidates(order) {
    const platform = order.platform;
    const zone     = order.zone;
    return [...this.#centers.entries()]
      .filter(([, c]) => {
        const capacityOk = c.currentLoad < c.capacity;
        const platformOk = !platform || c.platforms.length === 0 || c.platforms.includes(platform);
        return capacityOk && platformOk;
      })
      .map(([id]) => id);
  }

  #score(centerId, order) {
    const c = this.#centers.get(centerId);
    const loadRatio    = 1 - c.currentLoad / (c.capacity || 1);
    const costScore    = 1 / (c.costPerOrder * PHI_INV + 1);
    const zoneMatch    = order.zone && c.zones.includes(order.zone) ? PHI_INV : 0;
    // phi-weighted composite
    return loadRatio * PHI + costScore * PHI_INV + zoneMatch;
  }

  #updateAvgCost(cost) {
    const n = this.metrics.routed + 1;
    this.metrics.avgCost = parseFloat(((this.metrics.avgCost * (n - 1) + cost) / n).toFixed(4));
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default OrderRoutingProtocol;
