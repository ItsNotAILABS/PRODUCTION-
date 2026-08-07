"""Code index — profile cards, line-precise reads, and symbol search.

The problem this sells against: to change 20 lines of a 900-line module, an
agent currently loads all 900 into context. Across a repo that saturates the
window before the system is understood, and the tokens are billed either way.

A **profile card** is the shape of a file built from its AST: every symbol with
its exact line span, the imports, the logical sections, one line of intent per
symbol. Measured on a 124k-line corpus, a card runs ~12% of the file's bytes,
and the search-then-read loop cost 819 bytes for an edit that a full-file read
would have cost 35,907 — a 44x reduction on the same change.

Design constraints that come from the buyer, not from taste:

* **No model, no network, no GPU.** Parsing is an AST walk; ranking is BM25
  fused with graph structure. That makes the marginal cost of a request
  approximately the CPU to serve it, which is what lets this be sold per-seat
  instead of per-token.
* **Runs where the code already is.** Enterprises will not upload a private
  repo to someone else's API. Self-hosting is the product, not a downgrade.

Structure extraction lives in `parse.py` (nine languages), call-graph resolution
and centrality in `graph.py`, fusion in `rank.py`, and budgeted assembly in
`pack.py`. This module owns storage and the queries over it.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from loomcode import graph as G
from loomcode import parse as P
from loomcode import rank as R
from loomcode.pack import Pack as PackModel
from loomcode.pack import sort_relations as PackSort

# --- profiling ---------------------------------------------------------------


@dataclass
class Symbol:
    name: str
    kind: str                      # function | method | class | const
    line_start: int
    line_end: int
    signature: str = ""
    intent: str = ""
    parent: str | None = None
    complexity: int = 0

    @property
    def span(self) -> int:
        return self.line_end - self.line_start + 1


@dataclass
class Card:
    path: str
    language: str
    lines: int
    bytes: int
    content_hash: str
    module_intent: str = ""
    imports: list = field(default_factory=list)
    symbols: list = field(default_factory=list)
    sections: list = field(default_factory=list)
    exact: bool = True
    notes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["symbols"] = [asdict(s) if not isinstance(s, dict) else s for s in self.symbols]
        return d

    def render(self, max_symbols: int = 80) -> str:
        out = [f"# {self.path}  [{self.language}, {self.lines} lines]"]
        if self.module_intent:
            out.append(f"  {self.module_intent}")
        if not self.exact:
            out.append("  (line spans approximate for this language)")
        if self.imports:
            out.append(f"  imports: {', '.join(self.imports[:12])}")
        for s in self.sections:
            out.append(f"  §L{s['line']:<5} {s['title']}")
        for s in self.symbols[:max_symbols]:
            s = s if isinstance(s, dict) else asdict(s)
            owner = f"{s['parent']}." if s.get("parent") else ""
            hot = "!" if s.get("complexity", 0) >= 8 else " "
            tail = f"  — {s['intent']}" if s.get("intent") else ""
            out.append(f" {hot}L{s['line_start']}-{s['line_end']} {s['kind']:<8} {owner}{s['name']}{tail}")
        if len(self.symbols) > max_symbols:
            out.append(f"  … {len(self.symbols) - max_symbols} more symbols")
        return "\n".join(out)

    @property
    def compression(self) -> float:
        return len(self.render().encode()) / self.bytes if self.bytes else 1.0


def _hash(text: str) -> str:
    return hashlib.blake2b(text.encode(), digest_size=16).hexdigest()


def _sections(text: str) -> list:
    """Banner comments as logical sections.

    Handles the title-on-the-rule form and the title-between-rules form; only
    supporting the first silently yields zero sections on a lot of real code.
    """
    lines = text.splitlines()
    def is_rule(s):
        body = s.lstrip("#").strip()
        return s.startswith("#") and len(body) >= 5 and set(body) <= {"-", "=", "*"}
    out = []
    for i, raw in enumerate(lines, start=1):
        s = raw.strip()
        if not s.startswith("#"):
            continue
        if is_rule(s):
            if i < len(lines):
                nxt = lines[i].strip()
                if nxt.startswith("#") and not is_rule(nxt):
                    t = nxt.lstrip("#").strip().strip("-=* ").strip()
                    if len(t) > 2:
                        out.append({"line": i, "title": t[:80]})
            continue
        body = s.lstrip("#").strip()
        t = body.strip("-=* ").strip()
        if len(t) > 2 and (body.count("-") >= 3 or body.count("=") >= 3):
            out.append({"line": i, "title": t[:80]})
    dedup = []
    for s in out:
        if not dedup or dedup[-1]["title"] != s["title"]:
            dedup.append(s)
    return dedup



def profile_text(path: str, text: str) -> Card:
    """The shape of one file: symbols, spans, imports, sections, call sites.

    Delegates the language work to `parse`. What stays here is the packaging —
    a Card is the unit that gets stored, rendered and billed against, and it
    should not change shape when a new grammar is added.
    """
    ex = P.extract(path, text, Symbol)
    language = P.language_of(path)
    card = Card(
        path=path, language=language, lines=text.count("\n") + 1,
        bytes=len(text.encode()), content_hash=_hash(text),
        module_intent=getattr(ex, "module_intent", ""),
        imports=list(ex.imports), symbols=ex.symbols,
        sections=_sections(text) if language == "python" else [],
        exact=ex.exact, notes=list(ex.notes))
    card.calls = ex.calls              # type: ignore[attr-defined]
    card.bases = getattr(ex, "bases", {})   # type: ignore[attr-defined]
    return card


# --- tokenisation and ranking ------------------------------------------------

_STOP = {"the", "a", "an", "of", "to", "for", "and", "or", "is", "it", "this", "that",
         "with", "from", "in", "on", "as", "by", "be", "are", "was", "at", "so", "not",
         "self", "return", "returns", "none", "true", "false"}


def tokens(text: str) -> list:
    """Whole words plus camelCase/snake_case splits.

    An earlier version added 4-character shingles for fuzzy matching. On a real
    124k-line corpus that backfired: collisions between unrelated words swamped
    the real signal, and a query for "market power pricing markup" ranked an
    unrelated activation function above the pricing model it was looking for.
    """
    raw, cur = [], []
    for ch in text:
        if ch.isalnum():
            cur.append(ch)
        elif cur:
            raw.append("".join(cur)); cur = []
    if cur:
        raw.append("".join(cur))
    out = []
    for t in raw:
        low = t.lower()
        if low not in _STOP and len(low) > 1:
            out.append(low)
        for p in re.findall(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|\d+", t):
            pl = p.lower()
            if pl != low and pl not in _STOP and len(pl) > 2:
                out.append(pl)
    return out


_SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
  repo TEXT, path TEXT, language TEXT, lines INTEGER, bytes INTEGER,
  content_hash TEXT, module_intent TEXT, imports TEXT, sections TEXT,
  notes TEXT, exact INTEGER, indexed_at REAL,
  PRIMARY KEY (repo, path));
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT, path TEXT, name TEXT,
  kind TEXT, line_start INTEGER, line_end INTEGER, signature TEXT,
  intent TEXT, parent TEXT, complexity INTEGER, doc TEXT);
CREATE INDEX IF NOT EXISTS ix_nodes_repo ON nodes(repo);
CREATE INDEX IF NOT EXISTS ix_nodes_name ON nodes(repo, name);
CREATE INDEX IF NOT EXISTS ix_nodes_path ON nodes(repo, path);

-- Raw, unresolved call sites. Kept per-file so that reindexing one file does
-- not require reparsing the repo: resolution is repo-global and happens later.
CREATE TABLE IF NOT EXISTS callsites (
  repo TEXT, path TEXT, caller TEXT, callee TEXT, line INTEGER);
CREATE INDEX IF NOT EXISTS ix_calls_repo ON callsites(repo);
CREATE INDEX IF NOT EXISTS ix_calls_path ON callsites(repo, path);

-- Resolved edges and centrality, derived. Rebuilt from callsites whenever the
-- repo is marked dirty, never edited in place.
CREATE TABLE IF NOT EXISTS edges (
  repo TEXT, from_path TEXT, from_name TEXT, to_path TEXT, to_name TEXT,
  line INTEGER, confidence TEXT);
CREATE INDEX IF NOT EXISTS ix_edges_repo ON edges(repo);
CREATE INDEX IF NOT EXISTS ix_edges_from ON edges(repo, from_path, from_name);
CREATE INDEX IF NOT EXISTS ix_edges_to ON edges(repo, to_path, to_name);

CREATE TABLE IF NOT EXISTS centrality (
  repo TEXT, path TEXT, name TEXT, score REAL,
  PRIMARY KEY (repo, path, name));

CREATE TABLE IF NOT EXISTS graph_state (
  repo TEXT PRIMARY KEY, dirty INTEGER, built_at REAL, nodes INTEGER, edges INTEGER);
"""


class CodeIndex:
    """Per-repo index of profile cards and symbols."""

    def __init__(self, db_path: str = "loomcode.db"):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    # -- write ----------------------------------------------------------------
    def needs_reindex(self, repo: str, path: str, text: str) -> bool:
        row = self.conn.execute(
            "SELECT content_hash FROM files WHERE repo=? AND path=?", (repo, path)).fetchone()
        return row is None or row["content_hash"] != _hash(text)

    def put_file(self, repo: str, path: str, text: str, force: bool = False) -> dict:
        """Index one file. Skips unchanged content, so re-submitting a whole repo
        is cheap and callers do not need to track what moved."""
        if not force and not self.needs_reindex(repo, path, text):
            return {"path": path, "status": "unchanged"}
        card = profile_text(path, text)
        c = self.conn
        c.execute("DELETE FROM nodes WHERE repo=? AND path=?", (repo, path))
        c.execute("""INSERT OR REPLACE INTO files
                     (repo, path, language, lines, bytes, content_hash, module_intent,
                      imports, sections, notes, exact, indexed_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                  (repo, path, card.language, card.lines, card.bytes, card.content_hash,
                   card.module_intent, json.dumps(card.imports), json.dumps(card.sections),
                   json.dumps(card.notes), int(card.exact), time.time()))
        for s in card.symbols:
            d = asdict(s) if not isinstance(s, dict) else s
            doc = " ".join(tokens(d["name"])) * 4 + " " \
                + " ".join(tokens(f"{d.get('signature','')} {d.get('intent','')}")) * 2 + " " \
                + " ".join(tokens(f"{d.get('parent') or ''} {Path(path).stem}"))
            c.execute("""INSERT INTO nodes (repo, path, name, kind, line_start, line_end,
                         signature, intent, parent, complexity, doc)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                      (repo, path, d["name"], d["kind"], d["line_start"], d["line_end"],
                       d.get("signature", ""), d.get("intent", ""), d.get("parent"),
                       d.get("complexity", 0), doc))
        c.execute("DELETE FROM callsites WHERE repo=? AND path=?", (repo, path))
        c.executemany(
            "INSERT INTO callsites (repo, path, caller, callee, line) VALUES (?,?,?,?,?)",
            [(repo, path, cs.caller, cs.callee, cs.line) for cs in getattr(card, "calls", [])])
        self._mark_dirty(repo)
        c.commit()
        return {"path": path, "status": "indexed", "symbols": len(card.symbols),
                "lines": card.lines, "calls": len(getattr(card, "calls", [])),
                "compression": round(card.compression, 4)}

    def delete_file(self, repo: str, path: str) -> dict:
        self.conn.execute("DELETE FROM nodes WHERE repo=? AND path=?", (repo, path))
        self.conn.execute("DELETE FROM callsites WHERE repo=? AND path=?", (repo, path))
        cur = self.conn.execute("DELETE FROM files WHERE repo=? AND path=?", (repo, path))
        self._mark_dirty(repo)
        self.conn.commit()
        return {"path": path, "deleted": cur.rowcount > 0}

    # -- graph ----------------------------------------------------------------
    #
    # Resolution is repo-global: whether `optimal_price` is unique depends on
    # every other file. Doing it inside put_file would make indexing a 400-file
    # repo quadratic, so writes only set a flag and the graph is rebuilt on the
    # first read that needs it.

    def _mark_dirty(self, repo: str) -> None:
        self.conn.execute(
            "INSERT INTO graph_state (repo, dirty, built_at, nodes, edges) VALUES (?,1,0,0,0) "
            "ON CONFLICT(repo) DO UPDATE SET dirty=1", (repo,))

    def build_graph(self, repo: str) -> dict:
        """Resolve every call site in the repo and recompute centrality."""
        nodes = [(r["path"], r["name"]) for r in self.conn.execute(
            "SELECT path, name FROM nodes WHERE repo=? AND kind IN "
            "('function','method','class','type','interface','impl','module')",
            (repo,)).fetchall()]
        defs_by_name: dict = {}
        for path, name in nodes:
            defs_by_name.setdefault(name, []).append((path, name))
        file_defs: dict = {}
        for path, name in nodes:
            file_defs.setdefault(path, set()).add(name)

        calls = [(r["path"], r["caller"], r["callee"], r["line"]) for r in self.conn.execute(
            "SELECT path, caller, callee, line FROM callsites WHERE repo=?", (repo,)).fetchall()]
        edges = G.resolve_calls(defs_by_name, file_defs, calls)
        central = G.pagerank(edges, nodes)

        c = self.conn
        c.execute("DELETE FROM edges WHERE repo=?", (repo,))
        c.executemany(
            "INSERT INTO edges (repo, from_path, from_name, to_path, to_name, line, confidence) "
            "VALUES (?,?,?,?,?,?,?)",
            [(repo, e["from_path"], e["from"], e["to_path"], e["to"], e["line"],
              e["confidence"]) for e in edges])
        c.execute("DELETE FROM centrality WHERE repo=?", (repo,))
        c.executemany(
            "INSERT INTO centrality (repo, path, name, score) VALUES (?,?,?,?)",
            [(repo, p, n, s) for (p, n), s in central.items()])
        c.execute("INSERT INTO graph_state (repo, dirty, built_at, nodes, edges) "
                  "VALUES (?,0,?,?,?) ON CONFLICT(repo) DO UPDATE SET "
                  "dirty=0, built_at=excluded.built_at, nodes=excluded.nodes, "
                  "edges=excluded.edges", (repo, time.time(), len(nodes), len(edges)))
        c.commit()
        by_conf: dict = {}
        for e in edges:
            by_conf[e["confidence"]] = by_conf.get(e["confidence"], 0) + 1
        return {"nodes": len(nodes), "edges": len(edges), "by_confidence": by_conf}

    def ensure_graph(self, repo: str) -> None:
        row = self.conn.execute(
            "SELECT dirty FROM graph_state WHERE repo=?", (repo,)).fetchone()
        if row is None or row["dirty"]:
            self.build_graph(repo)

    def graph_summary(self, repo: str) -> dict:
        self.ensure_graph(repo)
        row = self.conn.execute(
            "SELECT nodes, edges, built_at FROM graph_state WHERE repo=?", (repo,)).fetchone()
        conf = {r["confidence"]: r["n"] for r in self.conn.execute(
            "SELECT confidence, COUNT(*) n FROM edges WHERE repo=? GROUP BY confidence",
            (repo,)).fetchall()}
        return {"nodes": row["nodes"] if row else 0, "edges": row["edges"] if row else 0,
                "by_confidence": conf, "built_at": row["built_at"] if row else 0}

    def edges(self, repo: str) -> list:
        self.ensure_graph(repo)
        return [{"from_path": r["from_path"], "from": r["from_name"],
                 "to_path": r["to_path"], "to": r["to_name"], "line": r["line"],
                 "confidence": r["confidence"]}
                for r in self.conn.execute(
                    "SELECT * FROM edges WHERE repo=?", (repo,)).fetchall()]

    def centrality(self, repo: str) -> dict:
        self.ensure_graph(repo)
        return {(r["path"], r["name"]): r["score"] for r in self.conn.execute(
            "SELECT path, name, score FROM centrality WHERE repo=?", (repo,)).fetchall()}

    def relations(self, repo: str, name: str, path: str | None = None) -> dict:
        hits = self.locate(repo, name)
        if path:
            hits = [h for h in hits if h["path"] == path]
        if not hits:
            raise KeyError(name)
        if len(hits) > 1:
            return {"ambiguous": True, "name": name, "candidates": hits}
        h = hits[0]
        rel = G.relations(self.edges(repo), (h["path"], name))
        central = self.centrality(repo)
        return {"ambiguous": False, "symbol": {**h, "name": name},
                "centrality": round(central.get((h["path"], name), 0.0), 6),
                **rel}

    def important(self, repo: str, top_k: int = 20) -> list:
        """The repo map: what a reader would most regret not knowing about."""
        self.ensure_graph(repo)
        rows = self.conn.execute(
            "SELECT c.path, c.name, c.score, n.kind, n.line_start, n.line_end, n.intent "
            "FROM centrality c LEFT JOIN nodes n "
            "ON n.repo=c.repo AND n.path=c.path AND n.name=c.name "
            "WHERE c.repo=? ORDER BY c.score DESC LIMIT ?", (repo, top_k)).fetchall()
        fan = {}
        for r in self.conn.execute(
                "SELECT to_path, to_name, COUNT(*) n FROM edges WHERE repo=? AND to_path IS NOT NULL "
                "GROUP BY to_path, to_name", (repo,)).fetchall():
            fan[(r["to_path"], r["to_name"])] = r["n"]
        return [{"path": r["path"], "name": r["name"], "kind": r["kind"],
                 "line_start": r["line_start"], "line_end": r["line_end"],
                 "intent": r["intent"], "centrality": round(r["score"], 6),
                 "called_from": fan.get((r["path"], r["name"]), 0)} for r in rows]

    # -- read -----------------------------------------------------------------
    def card(self, repo: str, path: str) -> dict:
        row = self.conn.execute(
            "SELECT * FROM files WHERE repo=? AND path=?", (repo, path)).fetchone()
        if row is None:
            raise KeyError(path)
        nodes = self.conn.execute(
            "SELECT name, kind, line_start, line_end, signature, intent, parent, complexity "
            "FROM nodes WHERE repo=? AND path=? ORDER BY line_start", (repo, path)).fetchall()
        return {"path": row["path"], "language": row["language"], "lines": row["lines"],
                "bytes": row["bytes"], "module_intent": row["module_intent"],
                "imports": json.loads(row["imports"]), "sections": json.loads(row["sections"]),
                "notes": json.loads(row["notes"]), "exact": bool(row["exact"]),
                "symbols": [dict(n) for n in nodes]}

    def locate(self, repo: str, name: str) -> list:
        return [dict(r) for r in self.conn.execute(
            "SELECT path, name, kind, line_start, line_end, intent, parent "
            "FROM nodes WHERE repo=? AND name=? ORDER BY path", (repo, name)).fetchall()]

    def search(self, repo: str, query: str, top_k: int = 8,
               anchor: tuple | None = None, dense: R.DenseProvider | None = None,
               weights: dict | None = None) -> list:
        """Hybrid search: lexical, name match, centrality, graph proximity.

        Each signal produces its own ordering and Reciprocal Rank Fusion
        combines the positions. Fusing positions rather than scores is what
        makes it safe to add a signal — BM25 and PageRank are on scales that
        have no defensible exchange rate, and any weighted sum of them is really
        a weighting of their variances.

        ``anchor`` is an optional ``(path, name)`` the caller is already working
        near; when given, call-graph distance from it becomes a fourth signal.
        """
        q = set(tokens(query))
        if not q:
            return []
        rows = self.conn.execute(
            "SELECT id, path, name, kind, line_start, line_end, intent, doc "
            "FROM nodes WHERE repo=?", (repo,)).fetchall()
        if not rows:
            return []

        w = dict(R.DEFAULT_WEIGHTS)
        if weights:
            w.update(weights)
        docs = [r["doc"].split() for r in rows]
        pool = max(top_k * 6, 40)

        lexical = R.bm25(docs, q)
        rankings = {"lexical": (w["lexical"], R.order(lexical, pool))}

        names = [R.name_match_boost(r["name"], query) for r in rows]
        if any(names):
            rankings["name"] = (w["name"], R.order(names, pool))

        central = self.centrality(repo)
        cvals = [central.get((r["path"], r["name"]), 0.0) for r in rows]
        # Centrality only votes among documents the text signals already
        # surfaced. Left unconstrained it returns the same hub functions for
        # every query, which reads as the index being broken.
        eligible = {i for i in R.order(lexical, pool)} | {i for i, v in enumerate(names) if v > 0}
        cranked = [i for i in R.order(cvals, len(rows)) if i in eligible]
        if cranked:
            rankings["central"] = (w["central"], cranked[:pool])

        if anchor:
            hops = G.neighbourhood(self.edges(repo), anchor, depth=2)
            prox = [1.0 / (1 + hops[(r["path"], r["name"])])
                    if (r["path"], r["name"]) in hops else 0.0 for r in rows]
            if any(prox):
                rankings["proximity"] = (w["proximity"], R.order(prox, pool))

        if dense is not None:
            try:
                rankings["dense"] = (w["dense"], dense.rank(query, docs, pool))
            except Exception:
                # A provider outage must degrade to lexical, not fail the query.
                pass

        fused = R.rrf(rankings, top_k=top_k)
        out = []
        for i, score, where in fused:
            r = rows[i]
            out.append({"path": r["path"], "name": r["name"], "kind": r["kind"],
                        "line_start": r["line_start"], "line_end": r["line_end"],
                        "intent": r["intent"], "score": score,
                        "centrality": round(cvals[i], 6),
                        "signals": where})
        return out

    def context_pack(self, repo: str, query: str, contents: dict,
                     budget_tokens: int = 4000, anchor: tuple | None = None,
                     depth: int = 1) -> dict:
        """Everything needed to make one edit, and nothing else, under budget.

        ``contents`` maps path -> current file text. The service does not store
        source, so the caller supplies the text for any file it wants sliced;
        a path that is absent simply contributes its card instead of its lines,
        which is also the right behaviour for a repo too large to send whole.
        """
        hits = self.search(repo, query, top_k=8, anchor=anchor)
        if not hits:
            return {"query": query, "found": False,
                    "pack": PackModel(budget_tokens).to_dict(), "rendered": ""}

        central = self.centrality(repo)
        edges = self.edges(repo)
        pk = PackModel(budget_tokens)
        top = hits[0]
        node = (top["path"], top["name"])

        def slice_of(path, start, end, pad=0):
            text = contents.get(path)
            if text is None:
                return None
            return read_lines(text, start, end, pad=pad)["text"]

        primary = slice_of(top["path"], top["line_start"], top["line_end"], pad=1)
        if primary is None:
            pk.omitted.append({"tier": "primary", "path": top["path"], "name": top["name"],
                               "citation": f"{top['path']}:L{top['line_start']}-L{top['line_end']}",
                               "line_start": top["line_start"], "line_end": top["line_end"],
                               "tokens": 0, "why": "query match",
                               "reason": "file content not supplied by caller"})
        else:
            pk.add("primary", top["path"], top["name"], top["line_start"],
                   top["line_end"], primary, "matched the query",
                   centrality=central.get(node))

        rel = G.relations(edges, node)
        spans = {(r["path"], r["name"]): r for r in self.conn.execute(
            "SELECT path, name, line_start, line_end FROM nodes WHERE repo=?",
            (repo,)).fetchall()}

        for tier, rows, why in (("callee", rel["callees"], "called by the match"),
                                ("caller", rel["callers"], "calls the match")):
            for r in PackSort(rows, central):
                key = (r["path"], r["name"])
                sp = spans.get(key)
                if sp is None or key == node:
                    continue
                text = slice_of(sp["path"], sp["line_start"], sp["line_end"])
                if text is None:
                    continue
                pk.add(tier, sp["path"], r["name"], sp["line_start"], sp["line_end"],
                       text, why, confidence=r.get("confidence"),
                       centrality=central.get(key))

        siblings = self.conn.execute(
            "SELECT name, kind, line_start, line_end, intent FROM nodes "
            "WHERE repo=? AND path=? AND name<>? ORDER BY line_start",
            (repo, top["path"], top["name"])).fetchall()
        if siblings:
            # Fit the sibling list to its tier cap rather than offering the whole
            # thing and having it rejected whole. Knowing about six of the other
            # symbols in the file is most of the value; knowing about none of
            # them because the twentieth did not fit is none of it.
            rows = sorted(siblings, key=lambda r: -central.get((top["path"], r["name"]), 0.0))
            cap_tokens = int(budget_tokens * 0.12)
            kept, used = [], 0
            for r in rows:
                line = (f"  L{r['line_start']}-{r['line_end']} {r['kind']:<8} {r['name']}"
                        + (f" — {r['intent']}" if r["intent"] else ""))
                cost = (len(line.encode()) + 4) // 4
                if used + cost > cap_tokens:
                    break
                kept.append((r["line_start"], line))
                used += cost
            if kept:
                body = "\n".join(l for _, l in sorted(kept))
                if len(kept) < len(siblings):
                    body += f"\n  … {len(siblings) - len(kept)} more, lowest-centrality omitted"
                pk.add("sibling", top["path"], f"{len(kept)} of {len(siblings)} other symbols",
                       1, top["line_start"], body, "same file, names only")

        seen_files = {top["path"]}
        for h in hits[1:]:
            if h["path"] in seen_files:
                continue
            seen_files.add(h["path"])
            try:
                card = self.card(repo, h["path"])
            except KeyError:
                continue
            rendered = Card(path=card["path"], language=card["language"],
                            lines=card["lines"], bytes=card["bytes"], content_hash="",
                            module_intent=card["module_intent"], imports=card["imports"],
                            sections=card["sections"],
                            symbols=[Symbol(**{k: sym[k] for k in
                                              ("name", "kind", "line_start", "line_end",
                                               "signature", "intent", "parent", "complexity")})
                                     for sym in card["symbols"]],
                            exact=card["exact"], notes=card["notes"]).render(max_symbols=30)
            pk.add("map", h["path"], Path(h["path"]).name, 1, card["lines"],
                   rendered, "also matched — file shape only")

        d = pk.to_dict()
        full = sum(len(t.encode()) for t in contents.values())
        d.update({
            "query": query, "found": True,
            "primary": {"path": top["path"], "name": top["name"],
                        "line_start": top["line_start"], "line_end": top["line_end"],
                        "score": top["score"], "signals": top["signals"]},
            "if_full_read": {"bytes": full, "tokens": (full + 3) // 4},
        })
        if d["used_tokens"]:
            d["reduction_factor"] = round(d["if_full_read"]["tokens"] / d["used_tokens"], 2)
        return {**d, "rendered": pk.render()}

    def repo_stats(self, repo: str) -> dict:
        f = self.conn.execute(
            "SELECT COUNT(*) n, COALESCE(SUM(lines),0) lines, COALESCE(SUM(bytes),0) bytes "
            "FROM files WHERE repo=?", (repo,)).fetchone()
        s = self.conn.execute("SELECT COUNT(*) n FROM nodes WHERE repo=?", (repo,)).fetchone()
        langs = self.conn.execute(
            "SELECT language, COUNT(*) n FROM files WHERE repo=? GROUP BY language",
            (repo,)).fetchall()
        return {"repo": repo, "files": f["n"], "lines": f["lines"], "bytes": f["bytes"],
                "symbols": s["n"], "languages": {r["language"]: r["n"] for r in langs}}

    def list_repos(self) -> list:
        return [r["repo"] for r in self.conn.execute(
            "SELECT DISTINCT repo FROM files ORDER BY repo").fetchall()]


def read_lines(text: str, start: int, end: int, pad: int = 0, numbered: bool = True) -> dict:
    """Slice [start, end] out of file content, 1-indexed and inclusive.

    Clamps out-of-range requests and says so rather than raising: an agent that
    asks for lines 900-950 of an 880-line file should get the tail and a flag,
    not an exception in the middle of a task.
    """
    if start < 1:
        raise ValueError("start is 1-indexed and must be >= 1")
    lines = text.splitlines()
    n = len(lines)
    lo, hi = max(1, start - pad), min(n, end + pad)
    clamped = start > n or end + pad > n
    body = lines[lo - 1:hi] if lo <= n else []
    rendered = "\n".join(f"{i:>5} | {ln}" for i, ln in enumerate(body, start=lo)) \
        if numbered else "\n".join(body)
    return {"start": lo, "end": hi, "requested": [start, end], "file_lines": n,
            "clamped": clamped, "text": rendered, "bytes": len(rendered.encode())}
