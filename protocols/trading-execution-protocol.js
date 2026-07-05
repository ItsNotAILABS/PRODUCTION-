/**
 * PROTO-FIN-002: Trading Execution Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Phi-gated order routing and execution risk management.
 * Orders are only submitted when:
 *   1. Signal coherence R ≥ phi_inv (0.618) — coherence gate
 *   2. Position size ≤ phi-fraction of portfolio capital
 *   3. Risk-per-trade ≤ 1/phi² of portfolio
 *
 * Order lifecycle: DRAFT → VALIDATED → ROUTED → FILLED | REJECTED | CANCELLED
 * Phi-scoring: successful fills amplify execution score; rejections decay it.
 */

'use strict';

const PHI     = 1.618033988749895;
const PHI_INV = 0.618033988749895;
const PHI_SQ  = PHI * PHI;

const ORDER_STATUS = Object.freeze({
  DRAFT:     'draft',
  VALIDATED: 'validated',
  ROUTED:    'routed',
  FILLED:    'filled',
  PARTIAL:   'partial',
  REJECTED:  'rejected',
  CANCELLED: 'cancelled',
});

const ORDER_SIDE = Object.freeze({ BUY: 'buy', SELL: 'sell' });
const ORDER_TYPE = Object.freeze({ MARKET: 'market', LIMIT: 'limit', STOP: 'stop' });

let _orderId = 1;

class Order {
  constructor({ symbol, side, type = ORDER_TYPE.MARKET, qty, limitPrice = null, stopPrice = null }) {
    this.id         = `ORD-${_orderId++}-${Date.now().toString(36)}`;
    this.symbol     = symbol;
    this.side       = side;
    this.type       = type;
    this.qty        = qty;
    this.limitPrice = limitPrice;
    this.stopPrice  = stopPrice;
    this.status     = ORDER_STATUS.DRAFT;
    this.fillPrice  = null;
    this.fillQty    = 0;
    this.phiScore   = 1.0;
    this.errors     = [];
    this.createdAt  = Date.now();
    this.routedAt   = null;
    this.filledAt   = null;
  }

  toDict() {
    return {
      id: this.id, symbol: this.symbol, side: this.side,
      type: this.type, qty: this.qty, status: this.status,
      fillPrice: this.fillPrice, fillQty: this.fillQty,
      phiScore: this.phiScore.toFixed(4), errors: this.errors,
    };
  }
}

class ExecutionEngine {
  constructor({ capitalUSD = 100_000, maxRiskFraction = null } = {}) {
    this.capital          = capitalUSD;
    this.maxRiskFraction  = maxRiskFraction ?? 1 / PHI_SQ;  // ≈ 0.382
    this.maxPosFraction   = 1 / PHI;                         // ≈ 0.618
    this.positions        = new Map();   // symbol → { qty, avgCost }
    this.orders           = [];
    this.phiScore         = 1.0;
    this._beat            = 0;
    this._fills           = 0;
    this._rejections      = 0;
  }

  /**
   * Validate an order against risk limits and signal coherence.
   * @param {Order} order
   * @param {number} signalCoherence  R ∈ [0,1]
   * @param {number} currentPrice
   * @returns {{ valid: bool, errors: string[] }}
   */
  validate(order, signalCoherence, currentPrice) {
    const errors = [];

    // Coherence gate
    if (signalCoherence < PHI_INV) {
      errors.push(`signal_incoherent: R=${signalCoherence.toFixed(3)} < phi_inv=${PHI_INV}`);
    }

    // Position size gate
    const notional = order.qty * currentPrice;
    if (notional > this.capital * this.maxPosFraction) {
      errors.push(`position_too_large: notional $${notional.toFixed(0)} > ${(this.maxPosFraction*100).toFixed(0)}% capital`);
    }

    // Risk gate
    const riskEstimate = notional * 0.02;  // assume 2% stop distance
    if (riskEstimate > this.capital * this.maxRiskFraction) {
      errors.push(`risk_too_high: estimated $${riskEstimate.toFixed(0)} > ${(this.maxRiskFraction*100).toFixed(0)}% capital`);
    }

    order.errors = errors;
    order.status = errors.length === 0 ? ORDER_STATUS.VALIDATED : ORDER_STATUS.REJECTED;
    if (order.status === ORDER_STATUS.REJECTED) this._rejections++;
    return { valid: errors.length === 0, errors };
  }

  /**
   * Route a validated order (simulated fill at market price).
   */
  route(order, currentPrice) {
    if (order.status !== ORDER_STATUS.VALIDATED) return order;

    order.status    = ORDER_STATUS.ROUTED;
    order.routedAt  = Date.now();

    // Simulated fill with 0.1% slippage
    const slippage  = order.side === ORDER_SIDE.BUY ? 1.001 : 0.999;
    order.fillPrice = parseFloat((currentPrice * slippage).toFixed(6));
    order.fillQty   = order.qty;
    order.status    = ORDER_STATUS.FILLED;
    order.filledAt  = Date.now();
    this._fills++;

    // Update position
    const pos = this.positions.get(order.symbol) || { qty: 0, avgCost: 0 };
    if (order.side === ORDER_SIDE.BUY) {
      const totalCost = pos.qty * pos.avgCost + order.fillQty * order.fillPrice;
      pos.qty += order.fillQty;
      pos.avgCost = totalCost / pos.qty;
    } else {
      pos.qty -= order.fillQty;
    }
    if (pos.qty === 0) this.positions.delete(order.symbol);
    else this.positions.set(order.symbol, pos);

    // Phi-score feedback
    order.phiScore = Math.min(PHI, order.phiScore * PHI);
    this.phiScore  = Math.min(PHI, this.phiScore * PHI);

    this.orders.push(order);
    return order;
  }

  /** Full submit: validate → route. */
  submit(orderDef, signalCoherence, currentPrice) {
    const order = new Order(orderDef);
    const { valid } = this.validate(order, signalCoherence, currentPrice);
    if (!valid) {
      this.orders.push(order);
      this.phiScore = Math.max(0.01, this.phiScore * PHI_INV);
      return order;
    }
    return this.route(order, currentPrice);
  }

  pulse() {
    this._beat++;
    return {
      beat:        this._beat,
      capital:     this.capital,
      phiScore:    this.phiScore.toFixed(4),
      fills:       this._fills,
      rejections:  this._rejections,
      positions:   this.positions.size,
    };
  }

  snapshot() {
    return {
      beat:       this._beat,
      capital:    this.capital,
      phiScore:   this.phiScore.toFixed(4),
      fills:      this._fills,
      rejections: this._rejections,
      orders:     this.orders.slice(-20).map(o => o.toDict()),
      positions:  Object.fromEntries(this.positions),
    };
  }
}

module.exports = { ExecutionEngine, Order, ORDER_STATUS, ORDER_SIDE, ORDER_TYPE, PHI, PHI_INV };
