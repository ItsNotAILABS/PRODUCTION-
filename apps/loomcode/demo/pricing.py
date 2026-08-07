"""Pricing and margin engine.

A deliberately ordinary service module — the kind of file an agent gets asked to
change one function inside of. Long enough that reading it whole to edit six
lines is obviously wasteful, and structured the way real code is: several
unrelated concerns sharing a file because they grew there.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

TAX_RATE = 0.0825
DEFAULT_CURRENCY = "USD"
ROUNDING_CENTS = 2


# --- data ---------------------------------------------------------------------


@dataclass
class LineItem:
    """One priced row on an order."""

    sku: str
    unit_cost: float
    quantity: int
    discount_pct: float = 0.0

    def net_cost(self) -> float:
        """Cost after the line discount, before tax."""
        return self.unit_cost * self.quantity * (1 - self.discount_pct)


@dataclass
class Customer:
    """A billable party, with whatever contract terms attach to them."""

    customer_id: str
    tier: str = "standard"
    tax_exempt: bool = False
    contracted_discount: float = 0.0


# --- elasticity and demand ----------------------------------------------------


def arc_elasticity(q1: float, q2: float, p1: float, p2: float) -> float:
    """Midpoint elasticity between two observed price/quantity points.

    Symmetric in the direction of the change, unlike the naive percentage form,
    which gives a different answer depending on which point you call the base.
    """
    if p1 == p2:
        raise ValueError("prices are identical: elasticity is undefined")
    if q1 + q2 == 0:
        raise ValueError("quantities sum to zero: elasticity is undefined")
    dq = (q2 - q1) / ((q1 + q2) / 2)
    dp = (p2 - p1) / ((p1 + p2) / 2)
    return dq / dp


def classify_elasticity(e: float) -> str:
    """Elastic, inelastic, or unit elastic."""
    a = abs(e)
    if a > 1:
        return "elastic"
    if a < 1:
        return "inelastic"
    return "unit elastic"


def demand_at_price(intercept: float, slope: float, price: float) -> float:
    """Linear demand curve Q = a - bP, floored at zero."""
    if slope <= 0:
        raise ValueError("slope must be positive for downward-sloping demand")
    return max(intercept - slope * price, 0.0)


# --- pricing ------------------------------------------------------------------


def optimal_price(marginal_cost: float, elasticity: float) -> float:
    """Profit-maximising price from the Lerner inverse-elasticity rule.

    P* = MC * e / (e + 1), valid only where demand is elastic (e < -1). Where
    demand is inelastic the rule has no interior optimum — it says raise price
    without bound — so this raises rather than returning a number that looks
    usable but is not.
    """
    if elasticity >= -1.0:
        raise ValueError(
            f"elasticity {elasticity:.4f} is inelastic; the markup rule has no "
            "finite optimum here and a different model is needed")
    if marginal_cost <= 0:
        raise ValueError("marginal cost must be positive")
    return marginal_cost * elasticity / (elasticity + 1.0)


def markup_over_cost(price: float, cost: float) -> float:
    """Markup as a fraction of cost."""
    if cost <= 0:
        raise ValueError("cost must be positive")
    return price / cost - 1.0


def apply_tier_discount(price: float, customer: Customer) -> float:
    """Contract and tier discounts, applied multiplicatively not additively.

    Additive stacking is the classic bug here: a 20% tier discount plus a 15%
    contract discount is not 35% off, and treating it that way silently gives
    away margin.
    """
    tier_rates = {"standard": 0.0, "silver": 0.05, "gold": 0.10, "platinum": 0.15}
    if customer.tier not in tier_rates:
        raise ValueError(f"unknown tier {customer.tier!r}")
    after_tier = price * (1 - tier_rates[customer.tier])
    return after_tier * (1 - customer.contracted_discount)


# --- totals -------------------------------------------------------------------


def order_subtotal(items: list[LineItem]) -> float:
    """Sum of net line costs before tax."""
    return sum(i.net_cost() for i in items)


def order_total(items: list[LineItem], customer: Customer) -> dict:
    """Full order total with discounts and tax."""
    subtotal = order_subtotal(items)
    discounted = apply_tier_discount(subtotal, customer)
    tax = 0.0 if customer.tax_exempt else discounted * TAX_RATE
    return {
        "subtotal": round(subtotal, ROUNDING_CENTS),
        "after_discount": round(discounted, ROUNDING_CENTS),
        "tax": round(tax, ROUNDING_CENTS),
        "total": round(discounted + tax, ROUNDING_CENTS),
        "currency": DEFAULT_CURRENCY,
    }


def break_even_units(fixed_costs: float, price: float, variable_cost: float) -> float:
    """Units needed to cover fixed costs at this contribution margin."""
    margin = price - variable_cost
    if margin <= 0:
        raise ValueError(
            f"contribution margin is {margin:.4f}: every unit sold loses money, "
            "so there is no break-even volume")
    return fixed_costs / margin


def contribution_margin_ratio(price: float, variable_cost: float) -> float:
    """Contribution margin as a share of price."""
    if price <= 0:
        raise ValueError("price must be positive")
    return (price - variable_cost) / price


# --- inventory ----------------------------------------------------------------


def economic_order_quantity(annual_demand: float, order_cost: float,
                            holding_cost: float) -> float:
    """EOQ = sqrt(2DS/H).

    At the optimum, annual ordering cost equals annual holding cost — that
    equality is the real content of the model, not the square root.
    """
    if min(annual_demand, order_cost, holding_cost) <= 0:
        raise ValueError("demand, order cost and holding cost must all be positive")
    return math.sqrt(2 * annual_demand * order_cost / holding_cost)


def reorder_point(daily_demand: float, lead_time_days: float,
                  safety_stock: float = 0.0) -> float:
    """Stock level that should trigger a replenishment order."""
    if daily_demand < 0 or lead_time_days < 0:
        raise ValueError("demand and lead time must be non-negative")
    return daily_demand * lead_time_days + safety_stock


def inventory_turns(cogs: float, average_inventory: float) -> float:
    """How many times inventory is sold and replaced per period."""
    if average_inventory <= 0:
        raise ValueError("average inventory must be positive")
    return cogs / average_inventory


# --- reporting ----------------------------------------------------------------


def margin_report(items: list[LineItem], revenue: float) -> dict:
    """Gross margin summary for a set of line items."""
    cost = order_subtotal(items)
    if revenue <= 0:
        raise ValueError("revenue must be positive")
    gross = revenue - cost
    return {
        "revenue": round(revenue, ROUNDING_CENTS),
        "cost": round(cost, ROUNDING_CENTS),
        "gross_margin": round(gross, ROUNDING_CENTS),
        "gross_margin_pct": round(gross / revenue * 100, 2),
        "line_count": len(items),
    }


def price_sensitivity_table(base_price: float, elasticity: float,
                            steps: int = 5) -> list[dict]:
    """Projected quantity and revenue across a range of price changes."""
    rows = []
    for pct in range(-steps, steps + 1):
        change = pct / 100.0
        new_price = base_price * (1 + change)
        qty_change = elasticity * change
        rows.append({
            "price_change_pct": pct,
            "price": round(new_price, ROUNDING_CENTS),
            "quantity_change_pct": round(qty_change * 100, 2),
            "revenue_index": round((1 + change) * (1 + qty_change), 4),
        })
    return rows
