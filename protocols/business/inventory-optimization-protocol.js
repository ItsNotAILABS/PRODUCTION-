/**
 * PROTO-B002: Inventory Optimization Protocol (IOP)
 * Derives from: HomeostaticDriveProtocol, AdaptiveKnowledgeAbsorptionProtocol
 * Maintains optimal stock levels using phi-math equilibrium targeting.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class InventoryOptimizationProtocol {
  constructor(config = {}) {
    this.version      = '1.0.0';
    this.domain       = 'business';
    this.safetyFactor = config.safetyFactor ?? PHI_INV;  // ≈ 0.618 of lead time demand
    this.reorderRatio = config.reorderRatio ?? PHI_INV;
    this.metrics      = { optimized: 0, reorderSignals: 0, overstockSignals: 0 };
  }

  /**
   * Optimize inventory levels across a catalogue.
   * @param {{ sku: string, stock: number, avgDailySales: number, leadTimeDays: number, cost?: number }[]} items
   * @returns {{ recommendations: object[], summary: object }}
   */
  optimize(items = []) {
    const recommendations = items.map((item) => this.#analyzeItem(item));
    this.metrics.optimized       += items.length;
    this.metrics.reorderSignals  += recommendations.filter((r) => r.action === 'reorder').length;
    this.metrics.overstockSignals+= recommendations.filter((r) => r.action === 'reduce').length;

    const totalExcess    = recommendations.reduce((a, r) => a + Math.max(0, r.excessUnits ?? 0), 0);
    const totalDeficit   = recommendations.reduce((a, r) => a + Math.max(0, r.deficitUnits ?? 0), 0);
    const healthScore    = 1 - (totalDeficit + totalExcess) / (items.reduce((a, i) => a + i.stock, 1) || 1);

    return {
      recommendations,
      summary: {
        totalItems:    items.length,
        reorderCount:  this.metrics.reorderSignals,
        overstockCount:this.metrics.overstockSignals,
        healthScore:   Math.max(0, Math.min(1, healthScore)),
        generatedAt:   new Date().toISOString(),
      },
    };
  }

  /**
   * Calculate the reorder point for an item.
   * @param {{ avgDailySales: number, leadTimeDays: number, stdDevDailySales?: number }} item
   * @returns {number}
   */
  reorderPoint(item) {
    const demandDuringLead = item.avgDailySales * item.leadTimeDays;
    const safetyStock      = (item.stdDevDailySales ?? item.avgDailySales * 0.2) * Math.sqrt(item.leadTimeDays) * this.safetyFactor;
    return Math.ceil(demandDuringLead + safetyStock);
  }

  /**
   * Economic Order Quantity using phi-adjusted Wilson formula.
   * @param {{ avgDailySales: number, orderCost: number, holdingCostPerUnit: number }} params
   * @returns {number}
   */
  eoq({ avgDailySales, orderCost, holdingCostPerUnit }) {
    const annualDemand = avgDailySales * 365;
    const raw = Math.sqrt((2 * annualDemand * orderCost) / (holdingCostPerUnit || 1));
    return Math.ceil(raw * PHI_INV);  // phi-adjusted for leaner inventory
  }

  #analyzeItem(item) {
    const rop       = this.reorderPoint(item);
    const optimal   = Math.ceil(item.avgDailySales * item.leadTimeDays * PHI);
    const excess    = item.stock - optimal;
    const deficit   = rop - item.stock;

    let action = 'hold';
    if (item.stock <= rop)    action = 'reorder';
    else if (excess > optimal * this.reorderRatio) action = 'reduce';

    return {
      sku:          item.sku,
      stock:        item.stock,
      reorderPoint: rop,
      optimalLevel: optimal,
      excessUnits:  Math.max(0, excess),
      deficitUnits: Math.max(0, deficit),
      action,
      urgency:      deficit > 0 ? Math.min(1, deficit / (rop || 1)) : 0,
    };
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export const INVENTORY_OPT_VERSION = '1.0.0';
export default InventoryOptimizationProtocol;
