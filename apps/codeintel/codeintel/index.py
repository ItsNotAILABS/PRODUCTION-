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

* **No model, no network, no GPU.** Parsing is stdlib ``ast``; ranking is BM25.
  That makes the marginal cost of a request approximately the CPU to serve it,
  which is what lets this be sold per-seat instead of per-token.
* **Runs where the code already is.** Enterprises will not upload a private
  repo to someone else's API. Self-hosting is the product, not a downgrade.
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
import sqlite3
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

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


def _complexity(node) -> int:
    n = 0
    for sub in ast.walk(node):
        if isinstance(sub, (ast.If, ast.For, ast.While, ast.Try, ast.With,
                            ast.ExceptHandler, ast.BoolOp, ast.IfExp, ast.comprehension)):
            n += 1
    return n


def _sig(node) -> str:
    try:
        a = [x.arg for x in node.args.args]
        if node.args.vararg:
            a.append("*" + node.args.vararg.arg)
        if node.args.kwarg:
            a.append("**" + node.args.kwarg.arg)
        return "(" + ", ".join(a) + ")"
    except Exception:
        return "(...)"


def _intent(node) -> str:
    doc = ast.get_docstring(node)
    return doc.strip().split("\n")[0].strip()[:120] if doc else ""


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


_JS_RE = re.compile(
    r"^\s*(?:export\s+)?(?:async\s+)?(?:function\s+(?P<fn>\w+)"
    r"|class\s+(?P<cls>\w+)"
    r"|(?:const|let|var)\s+(?P<const>\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>)", re.M)


def profile_text(path: str, text: str) -> Card:
    suffix = Path(path).suffix
    if suffix == ".py":
        try:
            tree = ast.parse(text, filename=path)
        except SyntaxError as e:
            return Card(path=path, language="python", lines=text.count("\n") + 1,
                        bytes=len(text.encode()), content_hash=_hash(text), exact=False,
                        notes=[f"syntax error line {e.lineno}: {e.msg}"])
        imports, symbols = [], []
        for node in tree.body:
            if isinstance(node, ast.Import):
                imports += [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                imports.append(node.module or ".")

        def visit(scope, parent=None):
            for ch in scope.body:
                if isinstance(ch, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    symbols.append(Symbol(ch.name, "method" if parent else "function",
                                          ch.lineno, getattr(ch, "end_lineno", ch.lineno),
                                          _sig(ch), _intent(ch), parent, _complexity(ch)))
                elif isinstance(ch, ast.ClassDef):
                    symbols.append(Symbol(ch.name, "class", ch.lineno,
                                          getattr(ch, "end_lineno", ch.lineno),
                                          "", _intent(ch), parent, _complexity(ch)))
                    visit(ch, ch.name)
                elif isinstance(ch, ast.Assign) and parent is None:
                    for t in ch.targets:
                        if isinstance(t, ast.Name) and t.id.isupper():
                            symbols.append(Symbol(t.id, "const", ch.lineno,
                                                  getattr(ch, "end_lineno", ch.lineno)))
        visit(tree)
        symbols.sort(key=lambda s: s.line_start)
        return Card(path=path, language="python", lines=text.count("\n") + 1,
                    bytes=len(text.encode()), content_hash=_hash(text),
                    module_intent=_intent(tree), imports=sorted(set(imports)),
                    symbols=symbols, sections=_sections(text), exact=True)

    if suffix in (".js", ".mjs", ".ts", ".tsx", ".jsx"):
        lines = text.splitlines()
        syms = []
        for m in _JS_RE.finditer(text):
            ln = text[:m.start()].count("\n") + 1
            name = m.group("fn") or m.group("cls") or m.group("const")
            kind = "function" if m.group("fn") else ("class" if m.group("cls") else "const")
            syms.append(Symbol(name, kind, ln, ln))
        syms.sort(key=lambda s: s.line_start)
        for i, s in enumerate(syms):
            s.line_end = syms[i + 1].line_start - 1 if i + 1 < len(syms) else len(lines)
        imports = re.findall(r"""^\s*import\s+.*?from\s+['"](.+?)['"]""", text, re.M)
        return Card(path=path, language="javascript", lines=len(lines),
                    bytes=len(text.encode()), content_hash=_hash(text),
                    imports=sorted(set(imports)), symbols=syms, exact=False,
                    notes=["spans approximate (regex scan); verify boundaries before editing"])

    return Card(path=path, language=suffix.lstrip(".") or "text",
                lines=text.count("\n") + 1, bytes=len(text.encode()),
                content_hash=_hash(text), exact=False,
                notes=["no parser for this file type; use read_lines directly"])


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
"""


class CodeIndex:
    """Per-repo index of profile cards and symbols."""

    def __init__(self, db_path: str = "codeintel.db"):
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
        c.commit()
        return {"path": path, "status": "indexed", "symbols": len(card.symbols),
                "lines": card.lines, "compression": round(card.compression, 4)}

    def delete_file(self, repo: str, path: str) -> dict:
        self.conn.execute("DELETE FROM nodes WHERE repo=? AND path=?", (repo, path))
        cur = self.conn.execute("DELETE FROM files WHERE repo=? AND path=?", (repo, path))
        self.conn.commit()
        return {"path": path, "deleted": cur.rowcount > 0}

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
               k1: float = 1.5, b: float = 0.75) -> list:
        """BM25 over name (4x), signature+docstring (2x) and path (1x).

        Field weighting matters more than it looks: without it a generic
        ``__init__`` in a plausibly-named file outranks the function actually
        being searched for, purely because the filename matched.
        """
        q = set(tokens(query))
        if not q:
            return []
        rows = self.conn.execute(
            "SELECT id, path, name, kind, line_start, line_end, intent, doc "
            "FROM nodes WHERE repo=?", (repo,)).fetchall()
        if not rows:
            return []
        docs = [r["doc"].split() for r in rows]
        lens = [len(d) or 1 for d in docs]
        avgdl = sum(lens) / len(lens)
        N = len(docs)
        sets = [set(d) for d in docs]

        import math
        scores = [0.0] * N
        for t in q:
            df = sum(1 for s in sets if t in s)
            if df == 0:
                continue
            idf = math.log(1 + (N - df + 0.5) / (df + 0.5))
            for i, d in enumerate(docs):
                tf = d.count(t)
                if tf:
                    scores[i] += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * lens[i] / avgdl))
        ranked = sorted(range(N), key=lambda i: -scores[i])[:top_k]
        return [{"path": rows[i]["path"], "name": rows[i]["name"], "kind": rows[i]["kind"],
                 "line_start": rows[i]["line_start"], "line_end": rows[i]["line_end"],
                 "intent": rows[i]["intent"], "score": round(scores[i], 4)}
                for i in ranked if scores[i] > 0]

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
