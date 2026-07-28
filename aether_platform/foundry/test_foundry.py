"""
Tests for the Worker Foundry. Proves generation is REAL, not stubs:

  1. All 40 templates load, list, and render.
  2. Every `{{TOKEN}}` for a declared param is substituted (no placeholders
     leak into a downloaded worker).
  3. Every generated Python file compiles; every Node file passes `node
     --check` (if node is present).
  4. Param overrides land in the output.
  5. The zip bundle is well-formed and contains the entry + README + run.sh.
  6. Smoke-run a couple of the pure-stdlib workers end to end (etl, spider
     against a local server) so "it runs" isn't a claim, it's tested.

Run:  python3 -m aether_platform.foundry.test_foundry
"""
from __future__ import annotations

import io
import json
import os
import py_compile
import shutil
import subprocess
import sys
import tempfile
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..")))
from aether_platform.foundry import Foundry  # noqa: E402

_TOKEN_LEFT = "{{"


def run():
    failures = []

    def check(label, cond, detail=""):
        print(("PASS" if cond else "FAIL") + f": {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    f = Foundry()
    templates = f.list_templates()
    check("manifest lists 40 templates", len(templates) == 40, f"got {len(templates)}")

    node_ok = shutil.which("node") is not None
    tmp = tempfile.mkdtemp(prefix="foundry-test-")

    for t in templates:
        tid = t["id"]
        rendered = f.render(tid)
        entry = rendered["entry"]
        body = rendered["files"].get(entry, "")

        check(f"{tid}: entry file rendered", bool(body))
        # No unresolved token for any *declared* param.
        declared = {p["name"] for p in t["params"]}
        leaked = [m for m in declared if (_TOKEN_LEFT + m + "}}") in "".join(rendered["files"].values())]
        check(f"{tid}: all declared params substituted", not leaked, f"leaked {leaked}")

        # Syntax-validate the generated code.
        wf = os.path.join(tmp, tid.replace("/", "_") + "_" + entry)
        with open(wf, "w") as fh:
            fh.write(body)
        if t["runtime"] == "python":
            try:
                py_compile.compile(wf, doraise=True)
                ok = True; detail = ""
            except py_compile.PyCompileError as e:
                ok = False; detail = str(e)
            check(f"{tid}: generated python compiles", ok, detail)
        elif t["runtime"] == "node" and node_ok:
            p = subprocess.run(["node", "--check", wf], capture_output=True, text=True)
            check(f"{tid}: generated node passes --check", p.returncode == 0, p.stderr.strip())

        # README + run.sh always present.
        check(f"{tid}: bundle has README + run.sh",
              "README.md" in rendered["files"] and "run.sh" in rendered["files"])

    # Param override lands in output.
    r = f.render("web-spider", {"START_URL": "https://override.test", "MAX_PAGES": "7"})
    spider = r["files"]["spider.py"]
    check("param override applied (start url)", "https://override.test" in spider)
    check("param override applied (max pages)", "default=7" in spider)

    # Zip bundle well-formed.
    z = f.bundle_zip("uptime-monitor", {"URLS": "https://a.test,https://b.test"})
    zf = zipfile.ZipFile(io.BytesIO(z))
    names = zf.namelist()
    check("zip contains entry, README, run.sh",
          any(n.endswith("uptime.py") for n in names)
          and any(n.endswith("README.md") for n in names)
          and any(n.endswith("run.sh") for n in names),
          str(names))

    # ── Smoke-run: ETL normalizer over a real CSV ──────────────────────
    etl = f.render("etl-normalizer")["files"]["etl.py"]
    etl_path = os.path.join(tmp, "etl.py")
    open(etl_path, "w").write(etl)
    csv_path = os.path.join(tmp, "in.csv")
    open(csv_path, "w").write("name,age\nada,36\nalan,41\n")
    p = subprocess.run([sys.executable, etl_path, "--input", csv_path, "--output", "-"],
                       capture_output=True, text=True, timeout=30)
    rows = [json.loads(l) for l in p.stdout.splitlines() if l.strip()]
    check("etl worker runs and normalizes CSV->JSONL",
          len(rows) == 2 and rows[0].get("name") == "ada", p.stderr.strip() or str(rows))

    # ── Smoke-run: spider against a tiny local site ────────────────────
    class Site(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def do_GET(self):
            pages = {
                "/": b"<title>Home</title><a href='/a'>a</a><a href='/b'>b</a>",
                "/a": b"<title>A</title><a href='/'>home</a>",
                "/b": b"<title>B</title>",
            }
            body = pages.get(self.path, b"<title>404</title>")
            self.send_response(200 if self.path in pages else 404)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)

    srv = ThreadingHTTPServer(("127.0.0.1", 0), Site)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        spider_code = f.render("web-spider", {"DELAY": "0"})["files"]["spider.py"]
        sp = os.path.join(tmp, "spider.py"); open(sp, "w").write(spider_code)
        p = subprocess.run([sys.executable, sp, "--start-url", f"http://127.0.0.1:{port}/",
                            "--max-pages", "10", "--delay", "0"],
                           capture_output=True, text=True, timeout=30)
        crawled = [json.loads(l) for l in p.stdout.splitlines() if l.strip()]
        got = {c.get("title") for c in crawled}
        check("spider worker crawls a real site (all 3 pages)",
              {"Home", "A", "B"}.issubset(got), f"titles={got} err={p.stderr.strip()}")
    finally:
        srv.shutdown()

    shutil.rmtree(tmp, ignore_errors=True)

    print()
    if failures:
        print(f"RESULT: {len(failures)} FAILED: {failures}")
        raise SystemExit(1)
    print("RESULT: Worker Foundry generates 40 real workers — every one substitutes its "
          "params, compiles/checks clean, and the sampled ones actually run (ETL normalizes "
          "a CSV, the spider crawls a live site). Zip bundles are ready to download and run.")


if __name__ == "__main__":
    run()
