"""Order fulfilment.

The second file exists so the demo has something to resolve *across*. A call
graph built from one file only ever produces `exact` edges, which makes the
confidence tiers look like decoration. Here `quote_order` reaches into
`pricing` and the resolver has to decide, from the repo rather than the file,
which definition was meant.
"""

from __future__ import annotations

from dataclasses import dataclass

from pricing import (Customer, LineItem, apply_tier_discount, break_even_units,
                     economic_order_quantity, optimal_price, order_total)

FULFILMENT_FEE = 4.95
RUSH_MULTIPLIER = 1.8


@dataclass
class Order:
    """A submitted order awaiting fulfilment."""

    order_id: str
    customer: Customer
    items: list
    rush: bool = False


def quote_order(order: Order, elasticity: float) -> dict:
    """Price an order end to end, including the fulfilment fee.

    Calls into the pricing module for the parts that are genuinely pricing
    decisions, rather than reimplementing the markup rule here — the second
    copy is the one that drifts.
    """
    priced = order_total(order.items, order.customer)
    fee = FULFILMENT_FEE * (RUSH_MULTIPLIER if order.rush else 1.0)
    unit = optimal_price(priced["subtotal"] / max(len(order.items), 1), elasticity)
    return {
        "order_id": order.order_id,
        "subtotal": priced["subtotal"],
        "tax": priced["tax"],
        "fulfilment_fee": round(fee, 2),
        "indicative_unit_price": round(unit, 2),
        "total": round(priced["total"] + fee, 2),
    }


def rush_surcharge(base: float, order: Order) -> float:
    """What the customer pays for rush handling, after their contract terms."""
    if not order.rush:
        return 0.0
    gross = base * (RUSH_MULTIPLIER - 1.0)
    return round(apply_tier_discount(gross, order.customer), 2)


def replenishment_plan(annual_demand: float, order_cost: float,
                       holding_cost: float, fixed_costs: float,
                       price: float, variable_cost: float) -> dict:
    """When to reorder and how many units justify the fixed costs."""
    eoq = economic_order_quantity(annual_demand, order_cost, holding_cost)
    breakeven = break_even_units(fixed_costs, price, variable_cost)
    return {
        "economic_order_quantity": round(eoq, 2),
        "orders_per_year": round(annual_demand / eoq, 2),
        "break_even_units": round(breakeven, 2),
        "covered_by_one_cycle": eoq >= breakeven,
    }


def split_shipment(order: Order, per_box: int) -> list:
    """Break an order into shippable boxes, largest first."""
    if per_box < 1:
        raise ValueError("per_box must be at least 1")
    boxes, current = [], []
    for item in sorted(order.items, key=lambda i: -i.quantity):
        current.append(item)
        if len(current) == per_box:
            boxes.append(current)
            current = []
    if current:
        boxes.append(current)
    return boxes


def fulfilment_summary(orders: list, elasticity: float) -> dict:
    """Aggregate quote across a batch of orders."""
    quotes = [quote_order(o, elasticity) for o in orders]
    if not quotes:
        return {"orders": 0, "revenue": 0.0, "average_order": 0.0}
    revenue = sum(q["total"] for q in quotes)
    return {
        "orders": len(quotes),
        "revenue": round(revenue, 2),
        "average_order": round(revenue / len(quotes), 2),
        "rush_orders": sum(1 for o in orders if o.rush),
    }


def line_items_from_rows(rows: list) -> list:
    """Build line items from raw tabular input."""
    out = []
    for row in rows:
        out.append(LineItem(sku=row["sku"], unit_cost=float(row["unit_cost"]),
                            quantity=int(row["quantity"]),
                            discount_pct=float(row.get("discount_pct", 0.0))))
    return out
