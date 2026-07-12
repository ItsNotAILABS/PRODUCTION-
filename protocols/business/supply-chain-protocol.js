/**
 * PROTO-B009: Supply Chain Protocol (SCP)
 * Derives from: AdaptiveKnowledgeAbsorptionProtocol, SwarmIntelligenceProtocol
 * Supply chain intelligence: supplier scoring, lead-time risk, and fulfillment routing.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class SupplyChainProtocol {
  constructor(config = {}) {
    this.version         = '1.0.0';
    this.domain          = 'business';
    this.leadTimeBuffer  = config.leadTimeBuffer ?? PHI_INV;  // ≈ 62% buffer on lead time
    this.metrics         = { suppliersScored: 0, risksDetected: 0, routesOptimized: 0 };
    this.#suppliers      = new Map();
  }

  #suppliers;

  /**
   * Register/update a supplier profile.
   * @param {{ supplierId: string, name: string, avgLeadTimeDays: number, reliability: number, costIndex: number, country?: string }} supplier
   */
  registerSupplier(supplier) {
    this.#suppliers.set(supplier.supplierId, {
      ...supplier,
      score: this.#scoreSupplier(supplier),
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * Score and rank all registered suppliers for a given SKU need.
   * @param {{ requiredLeadTimeDays: number, quantity: number, maxCost?: number }} requirement
   * @returns {{ ranked: object[], riskFlags: string[] }}
   */
  rankSuppliers(requirement) {
    const { requiredLeadTimeDays, maxCost } = requirement;
    let suppliers = [...this.#suppliers.values()];

    if (maxCost !== undefined) {
      suppliers = suppliers.filter((s) => s.costIndex <= maxCost);
    }

    const ranked = suppliers
      .map((s) => ({
        ...s,
        fitScore: this.#fitScore(s, requiredLeadTimeDays),
        bufferedLeadTime: Math.ceil(s.avgLeadTimeDays * (1 + this.leadTimeBuffer)),
        canMeetDeadline: s.avgLeadTimeDays * (1 + this.leadTimeBuffer) <= requiredLeadTimeDays,
      }))
      .sort((a, b) => b.fitScore - a.fitScore);

    const riskFlags = this.#detectRisks(ranked);
    this.metrics.suppliersScored += ranked.length;
    this.metrics.risksDetected   += riskFlags.length;

    return { ranked, riskFlags };
  }

  /**
   * Compute optimal fulfillment routing across warehouses/platforms.
   * @param {{ warehouseId: string, stock: number, shippingDays: number, costPerUnit: number }[]} warehouses
   * @param {{ quantity: number, maxDeliveryDays: number }} order
   * @returns {{ plan: object[], totalCost: number, estimatedDays: number }}
   */
  routeFulfillment(warehouses, order) {
    const eligible  = warehouses
      .filter((w) => w.shippingDays <= order.maxDeliveryDays && w.stock > 0)
      .sort((a, b) => a.costPerUnit * PHI_INV - b.costPerUnit * PHI_INV + a.shippingDays - b.shippingDays);

    const plan = [];
    let remaining = order.quantity;

    for (const w of eligible) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, w.stock);
      plan.push({ warehouseId: w.warehouseId, units: take, cost: take * w.costPerUnit, shippingDays: w.shippingDays });
      remaining -= take;
    }

    const totalCost       = plan.reduce((a, p) => a + p.cost, 0);
    const estimatedDays   = plan.length > 0 ? Math.max(...plan.map((p) => p.shippingDays)) : null;

    this.metrics.routesOptimized++;
    return { plan, totalCost, estimatedDays, fulfilled: order.quantity - remaining, unfulfilled: remaining };
  }

  #scoreSupplier({ reliability, avgLeadTimeDays, costIndex }) {
    const reliabilityScore = reliability * PHI;
    const speedScore       = (1 / (avgLeadTimeDays || 1)) * PHI_INV;
    const costScore        = (1 / (costIndex || 1)) * PHI_INV;
    return (reliabilityScore + speedScore + costScore) / (PHI + PHI_INV + PHI_INV);
  }

  #fitScore(supplier, requiredDays) {
    const leadFit     = requiredDays > 0 ? Math.min(1, requiredDays / (supplier.avgLeadTimeDays || 1)) * PHI_INV : 0;
    const reliability = supplier.reliability * PHI;
    return (reliability + leadFit) / (PHI + PHI_INV);
  }

  #detectRisks(ranked) {
    const risks = [];
    if (ranked.length === 0) risks.push('No qualified suppliers for requirement');
    if (ranked.filter((s) => s.canMeetDeadline).length === 0) risks.push('No supplier can meet required lead time');
    const countries = new Set(ranked.map((s) => s.country).filter(Boolean));
    if (countries.size === 1 && ranked.length > 1) risks.push('All suppliers in same country — geographic concentration risk');
    return risks;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default SupplyChainProtocol;
