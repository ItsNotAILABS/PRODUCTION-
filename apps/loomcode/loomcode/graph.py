"""Call graph — resolution with stated confidence, and centrality.

Parsing gives call *sites*: "something named `optimal_price` was called from
inside `total`". Turning that into an edge means deciding which definition was
meant, and that decision is frequently not knowable from static text alone. A
graph that hides this is worse than no graph, because an agent will follow a
wrong edge into the wrong file and never learn that the edge was a guess.

So every edge carries a confidence, and the tiers are ordered by what was
actually known:

``exact``
    Exactly one definition of that name in the same file. Local scope resolves
    it; nothing else can be meant.
``likely``
    Exactly one definition of that name in the whole repo. Almost always right,
    but an import of a same-named third-party symbol would fool it.
``ambiguous``
    Several definitions share the name. The candidates are all recorded and the
    edge weight is split between them, so a hub does not form purely because
    the name ``get`` is popular.
``external``
    No definition in the repo. Kept rather than dropped, because "this function
    calls into the SDK" is information, and dropping it makes a leaf look
    self-contained when it is not.

Centrality is PageRank over the resolved edges. It answers a question a text
index cannot: *what would I regret not knowing about?* A helper called from
forty places matters more than a leaf of the same size, and when a context pack
has to cut something, this is the signal that decides what survives.
"""

from __future__ import annotations

from collections import defaultdict

CONFIDENCE_WEIGHT = {"exact": 1.0, "likely": 0.75, "ambiguous": 0.4, "external": 0.0}

# Calls that carry no navigational information. `x.append(...)` and `len(x)`
# are not edges anyone would follow, and on a real module they outnumber the
# real ones roughly four to one — which buries the dependency edges that *are*
# worth seeing under a pile of `str` and `dict`.
#
# Exception constructors are deliberately NOT here. "This function raises
# ValueError" is part of its contract, and an agent editing a caller wants it.
BUILTIN_NOISE = {
    # python
    "len", "str", "int", "float", "bool", "dict", "list", "tuple", "set", "frozenset",
    "sum", "min", "max", "abs", "round", "sorted", "reversed", "enumerate", "zip",
    "range", "print", "isinstance", "issubclass", "getattr", "setattr", "hasattr",
    "type", "repr", "format", "open", "iter", "next", "any", "all", "map", "filter",
    "append", "extend", "pop", "get", "keys", "values", "items", "join", "split",
    "strip", "lstrip", "rstrip", "lower", "upper", "startswith", "endswith",
    "replace", "encode", "decode", "add", "update", "copy", "insert", "remove",
    "index", "count", "find", "sort", "reverse", "clear", "setdefault",
    # js / ts
    "console", "log", "require", "parseInt", "parseFloat", "JSON", "stringify",
    "push", "shift", "unshift", "slice", "splice", "concat", "forEach", "reduce",
    # go / rust / java
    "make", "append", "panic", "printf", "println", "sprintf", "unwrap",
    "to_string", "into", "clone", "as_str", "toString", "equals", "hashCode",
}


def resolve_calls(defs_by_name: dict, file_defs: dict, calls: list) -> list:
    """Turn call sites into edges with a confidence tier.

    ``defs_by_name``: name -> list of (path, symbol_name) across the repo.
    ``file_defs``:    path -> set of symbol names defined in that file.
    ``calls``:        list of (path, caller_name, callee_name, line).
    """
    edges = []
    for path, caller, callee, line in calls:
        if caller is None:
            continue                      # module-level call: no source node
        if callee in BUILTIN_NOISE and callee not in defs_by_name:
            continue                      # not an edge anyone would follow
        local = [(p, n) for (p, n) in defs_by_name.get(callee, []) if p == path]
        if len(local) == 1:
            edges.append({"from_path": path, "from": caller, "to_path": local[0][0],
                          "to": callee, "line": line, "confidence": "exact"})
            continue

        candidates = defs_by_name.get(callee, [])
        if len(candidates) == 1:
            edges.append({"from_path": path, "from": caller, "to_path": candidates[0][0],
                          "to": callee, "line": line, "confidence": "likely"})
        elif len(candidates) > 1:
            for cp, _ in candidates:
                edges.append({"from_path": path, "from": caller, "to_path": cp,
                              "to": callee, "line": line, "confidence": "ambiguous",
                              "candidates": len(candidates)})
        else:
            edges.append({"from_path": path, "from": caller, "to_path": None,
                          "to": callee, "line": line, "confidence": "external"})
    return edges


def pagerank(edges: list, nodes: list, damping: float = 0.85,
             iterations: int = 40, tol: float = 1e-9) -> dict:
    """PageRank over ``(path, name)`` nodes, weighted by edge confidence.

    Two details that matter for a code graph specifically:

    * Edges are weighted by confidence, so a guessed edge moves less rank than a
      resolved one. An ambiguous call that fans out to four candidates
      contributes a quarter as much as a certain one — its weight is already
      low, and it is divided again by the fan-out.
    * Dangling nodes (things that call nothing) redistribute uniformly rather
      than leaking rank out of the system. Leaf utilities are the *majority* of
      any real codebase, so leaking here would quietly deflate every score and
      make the ordering depend on how many leaves happen to be indexed.
    """
    if not nodes:
        return {}
    idx = {n: i for i, n in enumerate(nodes)}
    n = len(nodes)

    out_w = defaultdict(float)
    adj = defaultdict(list)
    for e in edges:
        if e["to_path"] is None:
            continue                        # external: no node to send rank to
        src, dst = (e["from_path"], e["from"]), (e["to_path"], e["to"])
        if src not in idx or dst not in idx or src == dst:
            continue
        w = CONFIDENCE_WEIGHT[e["confidence"]]
        if w <= 0:
            continue
        adj[idx[src]].append((idx[dst], w))
        out_w[idx[src]] += w

    rank = [1.0 / n] * n
    base = (1.0 - damping) / n
    for _ in range(iterations):
        nxt = [base] * n
        dangling = 0.0
        for i in range(n):
            if out_w[i] <= 0:
                dangling += rank[i]
                continue
            share = damping * rank[i] / out_w[i]
            for j, w in adj[i]:
                nxt[j] += share * w
        if dangling:
            spread = damping * dangling / n
            nxt = [v + spread for v in nxt]
        delta = sum(abs(a - b) for a, b in zip(nxt, rank))
        rank = nxt
        if delta < tol:
            break
    return {nodes[i]: rank[i] for i in range(n)}


def neighbourhood(edges: list, node: tuple, depth: int = 1) -> dict:
    """Callers and callees within ``depth`` hops, nearest first.

    Returned as ``{(path, name): hops}``. Direction is deliberately not tracked
    in the distance — for the purpose of "what else should I be looking at",
    the function that calls this one is exactly as relevant as the one it calls.
    """
    fwd, back = defaultdict(set), defaultdict(set)
    for e in edges:
        if e["to_path"] is None:
            continue
        s, d = (e["from_path"], e["from"]), (e["to_path"], e["to"])
        fwd[s].add(d)
        back[d].add(s)

    seen = {node: 0}
    frontier = [node]
    for hop in range(1, depth + 1):
        nxt = []
        for cur in frontier:
            for nb in fwd[cur] | back[cur]:
                if nb not in seen:
                    seen[nb] = hop
                    nxt.append(nb)
        frontier = nxt
        if not frontier:
            break
    seen.pop(node, None)
    return seen


def relations(edges: list, node: tuple) -> dict:
    """The direct relations of one symbol, grouped and confidence-tagged."""
    callers, callees, external = [], [], []
    for e in edges:
        src, dst = (e["from_path"], e["from"]), (e["to_path"], e["to"])
        if src == node:
            rec = {"name": e["to"], "path": e["to_path"], "line": e["line"],
                   "confidence": e["confidence"]}
            (external if e["to_path"] is None else callees).append(rec)
        elif e["to_path"] is not None and dst == node:
            callers.append({"name": e["from"], "path": e["from_path"], "line": e["line"],
                            "confidence": e["confidence"]})

    def dedupe(rows):
        out, seen = [], set()
        for r in sorted(rows, key=lambda r: (r["path"] or "", r["name"], r["line"])):
            key = (r["path"], r["name"])
            if key not in seen:
                seen.add(key)
                out.append(r)
        return out

    return {"callers": dedupe(callers), "callees": dedupe(callees),
            "external": dedupe(external)}
