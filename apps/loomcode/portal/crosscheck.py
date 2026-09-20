#!/usr/bin/env python3
"""crosscheck.py — assert the browser engine agrees with the service.

The portal runs the pipeline client-side so a visitor can try it without an
account. That is only honest while the two implementations produce the same
answer: a playground that quietly disagrees with the API is a demo that lies,
and it would lie most convincingly to the people evaluating whether to buy.

So this runs both over the same corpus and fails on any difference in the
things the page actually shows — symbol counts, resolved edges and their
confidence tiers, the ranked hits, and every element of the assembled pack.

    python3 portal/crosscheck.py          # from apps/loomcode

Run it after touching loomcode/{parse,graph,rank,pack}.py or portal/engine.js.
It is wired into the test suite as well, skipping if node is unavailable.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent

QUERIES = [
    "optimal price from elasticity",
    "economic order quantity",
    "order total with tax and discounts",
    "break even units",
    "split an order into boxes",
]
BUDGET = 1200

_NODE_DRIVER = r"""
import { run } from "%(engine)s";
import fs from "fs";
const sources = JSON.parse(fs.readFileSync("%(samples)s", "utf8"));
const out = {};
for (const q of %(queries)s) {
  const r = run(sources, q, %(budget)d);
  out[q] = {
    edges: r.stats.edges,
    by_confidence: r.stats.byConfidence,
    hits: r.hits.map((h) => `${h.name}@${h.path}:${h.lineStart}-${h.lineEnd}`),
    used: r.pack.used,
    full: r.fullTokens,
    elements: r.pack.elements.map((e) => `${e.tier}|${e.citation}|${e.tokens}|${e.confidence || ""}`),
  };
}
process.stdout.write(JSON.stringify(out));
"""


def js_results(samples_path: Path) -> dict:
    driver = _NODE_DRIVER % {
        "engine": (HERE / "engine.js").as_posix(),
        "samples": samples_path.as_posix(),
        "queries": json.dumps(QUERIES),
        "budget": BUDGET,
    }
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False) as fh:
        fh.write(driver)
        path = fh.name
    try:
        proc = subprocess.run([shutil.which("node") or "node", path],
                              capture_output=True, text=True, timeout=120)
        if proc.returncode != 0:
            raise RuntimeError(f"node driver failed:\n{proc.stderr[-2000:]}")
        return json.loads(proc.stdout)
    finally:
        os.unlink(path)


def py_results(sources: dict) -> dict:
    os.environ.setdefault("LOOM_DB", os.path.join(tempfile.mkdtemp(), "crosscheck.db"))
    sys.path.insert(0, str(APP))
    from loomcode.index import CodeIndex

    ix = CodeIndex(os.environ["LOOM_DB"])
    repo = "crosscheck"
    for path, text in sources.items():
        ix.put_file(repo, path, text)

    g = ix.graph_summary(repo)
    out = {}
    for q in QUERIES:
        hits = ix.search(repo, q, top_k=8)
        pack = ix.context_pack(repo, q, sources, budget_tokens=BUDGET)
        out[q] = {
            "edges": g["edges"],
            "by_confidence": g["by_confidence"],
            "hits": [f"{h['name']}@{h['path']}:{h['line_start']}-{h['line_end']}" for h in hits],
            "used": pack["used_tokens"],
            "full": pack["if_full_read"]["tokens"],
            "elements": [f"{e['tier']}|{e['citation']}|{e['tokens']}|{e.get('confidence') or ''}"
                         for e in pack["elements"]],
        }
    return out


def compare(py: dict, js: dict) -> list:
    problems = []
    for q in QUERIES:
        a, b = py[q], js[q]
        for field in ("edges", "by_confidence", "hits", "used", "full", "elements"):
            if a[field] != b[field]:
                problems.append(f"{q!r} · {field}\n    service: {a[field]}\n    browser: {b[field]}")
    return problems


def main() -> int:
    samples = HERE / "samples.json"
    sources = json.loads(samples.read_text())
    problems = compare(py_results(sources), js_results(samples))
    if problems:
        print("browser engine disagrees with the service:\n")
        for p in problems:
            print("  " + p.replace("\n", "\n  ") + "\n")
        return 1
    print(f"engines agree across {len(QUERIES)} queries "
          f"({len(sources)} files, budget {BUDGET} tokens)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
