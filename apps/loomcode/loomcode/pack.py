"""Context packs — assemble the most useful spans that fit a token budget.

``search`` answers "where is it". A pack answers the question an agent actually
has, which is "what do I need in front of me to change this safely". Those are
different: the function you are editing is rarely sufficient on its own, and the
whole file is almost always far more than necessary.

The assembly is a priority fill, not a ranked list truncated at the end:

1. **primary** — the span the query resolved to. If this does not fit, nothing
   else matters and the pack says so rather than quietly returning neighbours.
2. **callee** — what it calls. Editing a function without seeing what it
   delegates to is where the contract gets broken.
3. **caller** — what calls it, so a signature change is visible as a breakage
   before it is made.
4. **sibling** — other symbols in the same file, as card lines only. One line
   each; enough to know they exist and not to collide with them.
5. **map** — profile cards for the other files that came up. The shape of a
   file at roughly a tenth of its bytes.

Every tier has a cap as well as a priority, because priority alone is not
enough: a hot utility with sixty callers would consume an entire 32k budget on
tier 3 and leave nothing for the file map, and the pack would be technically
correct and practically useless. Within a tier, ordering is by edge confidence
first and PageRank centrality second — a certain edge to a peripheral function
beats a guessed edge to a hub, because the guess might simply be wrong.

Anything that does not fit is reported, with the reason. An agent that can see
"3 callers omitted, budget exhausted" can ask for more; an agent handed a
silently truncated pack cannot.
"""

from __future__ import annotations

BYTES_PER_TOKEN = 4          # same convention the rest of the service reports in

# Fraction of the budget any one tier may consume. Primary is uncapped because
# a pack without it is not a pack.
TIER_CAP = {"primary": 1.0, "callee": 0.35, "caller": 0.25, "sibling": 0.12, "map": 0.20}

TIER_ORDER = ["primary", "callee", "caller", "sibling", "map"]


def estimate_tokens(text: str) -> int:
    return (len(text.encode()) + BYTES_PER_TOKEN - 1) // BYTES_PER_TOKEN


class Pack:
    """A budgeted set of context elements, with an audit trail of what was cut."""

    def __init__(self, budget_tokens: int):
        self.budget = budget_tokens
        self.used = 0
        self.elements: list = []
        self.omitted: list = []
        self._tier_used: dict = {t: 0 for t in TIER_ORDER}

    def _cap(self, tier: str) -> int:
        return int(self.budget * TIER_CAP.get(tier, 0.1))

    def add(self, tier: str, path: str, name: str, start: int, end: int,
            text: str, why: str, confidence: str | None = None,
            centrality: float | None = None) -> bool:
        cost = estimate_tokens(text)
        entry = {"tier": tier, "path": path, "name": name,
                 "citation": f"{path}:L{start}-L{end}", "line_start": start,
                 "line_end": end, "tokens": cost, "why": why}
        if confidence:
            entry["confidence"] = confidence
        if centrality is not None:
            entry["centrality"] = round(centrality, 6)

        if self.used + cost > self.budget:
            self.omitted.append({**entry, "reason": "budget exhausted"})
            return False
        if tier != "primary" and self._tier_used[tier] + cost > self._cap(tier):
            self.omitted.append({**entry, "reason": f"{tier} tier cap reached"})
            return False

        entry["text"] = text
        self.elements.append(entry)
        self.used += cost
        self._tier_used[tier] += cost
        return True

    def render(self) -> str:
        """The pack as one block of text, ready to hand to a model.

        Citations are emitted as headers rather than as a separate structure so
        that a model quoting the pack back carries the coordinates with it —
        that is what makes an edit writable against the lines it was read from.
        """
        out = []
        for tier in TIER_ORDER:
            rows = [e for e in self.elements if e["tier"] == tier]
            if not rows:
                continue
            out.append(f"===== {tier.upper()} =====")
            for e in rows:
                head = f"--- {e['citation']}  {e['name']}  ({e['why']})"
                if e.get("confidence"):
                    head += f"  [{e['confidence']}]"
                out.append(head)
                out.append(e["text"])
        if self.omitted:
            out.append("===== OMITTED =====")
            for e in self.omitted:
                out.append(f"--- {e['citation']}  {e['name']}  "
                           f"({e['tier']}, {e['tokens']} tokens, {e['reason']})")
        return "\n".join(out)

    def to_dict(self) -> dict:
        return {
            "budget_tokens": self.budget,
            "used_tokens": self.used,
            "headroom_tokens": max(self.budget - self.used, 0),
            "elements": self.elements,
            "omitted": self.omitted,
            "tiers": {t: self._tier_used[t] for t in TIER_ORDER if self._tier_used[t]},
        }


def sort_relations(rows: list, centrality: dict) -> list:
    """Confidence first, centrality second — a certain edge beats a guessed one.

    Sorting by centrality alone looks smarter and is worse: the highest-PageRank
    thing reachable from here is frequently reached by an ``ambiguous`` edge
    precisely *because* its name is common, and a common name is exactly what
    makes resolution unreliable.
    """
    rank = {"exact": 0, "likely": 1, "ambiguous": 2, "external": 3}
    return sorted(rows, key=lambda r: (
        rank.get(r.get("confidence", "external"), 3),
        -centrality.get((r.get("path"), r.get("name")), 0.0),
        r.get("name", ""),
    ))
