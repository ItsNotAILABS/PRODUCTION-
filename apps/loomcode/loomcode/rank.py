"""Hybrid ranking — sparse text, structural importance, graph proximity.

A query like "where do we compute the optimal price" has three independent
kinds of evidence pointing at the answer, and each one fails differently:

* **Lexical (BM25).** Fails when the words in the question are not the words in
  the code.
* **Structural (PageRank centrality).** Fails on anything peripheral — a
  perfectly correct answer that nothing else calls scores near zero.
* **Proximity.** When the caller already knows roughly where it is working,
  distance in the call graph from that anchor is strong evidence. Useless
  without an anchor.

Because they fail in unrelated places, fusing them beats any one of them, but
only if the fusion does not require their scores to be comparable — a BM25
score of 7.4 and a PageRank of 0.003 live on different scales, and normalising
them into a weighted sum means inventing an exchange rate nobody can defend.

**Reciprocal Rank Fusion** avoids that entirely: it throws away the scores and
keeps only the positions, scoring each document ``Σ w / (k + rank)`` over the
rankers that returned it. Anything ranked highly by two different signals beats
anything ranked highly by one, which is the property actually wanted here.

On dense retrieval: the interface below takes a ``DenseProvider``, and nothing
ships in the box. That is a deliberate omission, not an oversight — the whole
economic claim of this service is that a request costs CPU and nothing else, and
the moment an embedding model is in the request path that claim is gone. An
earlier build did try a dependency-free hashing pseudo-embedding; on a real
124k-line corpus it ranked an unrelated activation function above the pricing
model being searched for, because 96 dimensions across 7,641 symbols collide far
more than intuition suggests. Bring your own provider and it fuses as a fourth
ranker; run without one and the honest answer is that search here is lexical.
"""

from __future__ import annotations

import math
import re
from typing import Protocol


class DenseProvider(Protocol):
    """Optional semantic ranker. Implement this to fuse embeddings in.

    ``rank`` returns document indices best-first — positions only, because RRF
    never looks at the scores. Anything that can order documents qualifies: a
    hosted embedding API, a local model, a cross-encoder re-ranker.
    """

    def rank(self, query: str, docs: list, top_k: int) -> list: ...


# --- sparse -------------------------------------------------------------------

def bm25(docs: list, query_terms: set, k1: float = 1.5, b: float = 0.75) -> list:
    """Okapi BM25 over pre-tokenised documents. Returns one score per document.

    Field weighting is applied by the caller repeating terms when the document
    is built — a name is written four times, the signature and docstring twice.
    Without it a generic ``__init__`` in a plausibly-named file outranks the
    function actually being searched for, purely because the filename matched.
    """
    if not docs or not query_terms:
        return [0.0] * len(docs)
    lens = [len(d) or 1 for d in docs]
    avgdl = sum(lens) / len(lens)
    n = len(docs)
    sets = [set(d) for d in docs]
    counts = [{} for _ in docs]
    for i, d in enumerate(docs):
        c = counts[i]
        for t in d:
            c[t] = c.get(t, 0) + 1

    scores = [0.0] * n
    for t in query_terms:
        df = sum(1 for s in sets if t in s)
        if df == 0:
            continue
        idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
        for i in range(n):
            tf = counts[i].get(t, 0)
            if tf:
                scores[i] += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * lens[i] / avgdl))
    return scores


def name_match_boost(name: str, query: str) -> float:
    """How directly the symbol's own name answers the query.

    Kept out of BM25 rather than folded into it. BM25 measures a term against a
    corpus; this measures a string against a string, and mixing the two makes
    the field weights impossible to reason about. An exact name match is the
    single most reliable signal there is, and it deserves to be legible.
    """
    q = query.strip().lower()
    n = name.lower()
    if not q or not n:
        return 0.0
    if n == q or n == q.replace(" ", "_") or n == q.replace(" ", ""):
        return 1.0
    parts = [p for p in re.split(r"[\s_]+", q) if p]
    if not parts:
        return 0.0
    hits = sum(1 for p in parts if p in n)
    covered = hits / len(parts)
    if n.startswith(parts[0]) or n.endswith(parts[-1]):
        covered = min(1.0, covered + 0.15)
    return round(covered * 0.8, 4)


# --- fusion -------------------------------------------------------------------

def rrf(rankings: dict, k: int = 60, top_k: int | None = None) -> list:
    """Reciprocal Rank Fusion. ``rankings`` is ``{name: (weight, [ids...])}``.

    ``k`` damps the head of each list: with k=60 the gap between rank 1 and
    rank 2 is small, so a document has to place well across several rankers to
    win rather than winning on one ranker's confident first pick. That is the
    entire point of fusing, and setting k small quietly undoes it.

    Returns ``[(id, fused_score, {ranker: rank}), ...]`` best first, keeping the
    per-ranker positions so a result can explain why it placed where it did.
    """
    fused: dict = {}
    where: dict = {}
    for ranker, (weight, ids) in rankings.items():
        if weight <= 0:
            continue
        for pos, doc_id in enumerate(ids, start=1):
            fused[doc_id] = fused.get(doc_id, 0.0) + weight / (k + pos)
            where.setdefault(doc_id, {})[ranker] = pos
    out = sorted(fused.items(), key=lambda kv: -kv[1])
    if top_k is not None:
        out = out[:top_k]
    return [(doc_id, round(score, 6), where[doc_id]) for doc_id, score in out]


def order(scores: list, limit: int) -> list:
    """Indices of the ``limit`` highest scores, best first, zeroes dropped."""
    ranked = sorted(range(len(scores)), key=lambda i: -scores[i])
    return [i for i in ranked[:limit] if scores[i] > 0]


# --- weights ------------------------------------------------------------------

# Defaults, tuned by what each signal is good for rather than by a sweep — a
# sweep against a hand-written query set would fit the query set. Lexical leads
# because it is the only signal that reads the question at all; name match is
# close behind because when it fires it is nearly always right; centrality is a
# tiebreaker, not a ranker, and given a full vote it drags every query toward the
# same handful of hub functions.
DEFAULT_WEIGHTS = {
    "lexical": 1.0,
    "name": 0.9,
    "central": 0.35,
    "proximity": 0.6,
    "dense": 1.0,
}
