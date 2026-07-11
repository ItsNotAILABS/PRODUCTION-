"""
Tests for the Worker Studio. Runs fully without an API key by exercising the
honest-failure path and the JSON parser; if ANTHROPIC_API_KEY is set, it also
does one REAL generation and validates the returned worker actually compiles.

Run:  python3 -m aether_platform.studio.test_studio
"""
from __future__ import annotations

import os
import py_compile
import sys
import tempfile

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..")))
from aether_platform.studio import WorkerStudio, StudioError  # noqa: E402
from aether_platform.studio.studio import _parse_worker_json  # noqa: E402


def run():
    failures = []

    def check(label, cond, detail=""):
        print(("PASS" if cond else "FAIL") + f": {label}" + (f"  ({detail})" if detail and not cond else ""))
        if not cond:
            failures.append(label)

    studio = WorkerStudio()

    # ── Honest failure with no key (never returns a fake worker) ────────
    saved = os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        raised = ""
        try:
            studio.generate("a spider that crawls example.com", api_key="")
        except StudioError as e:
            raised = str(e)
        check("no-key generate raises a clear StudioError (no fake worker)",
              raised.startswith("no_api_key"), raised)

        emptied = ""
        try:
            studio.generate("   ", api_key="fake-key-not-used-because-empty-prompt")
        except StudioError as e:
            emptied = str(e)
        check("empty prompt is rejected", emptied.startswith("empty_prompt"), emptied)
    finally:
        if saved is not None:
            os.environ["ANTHROPIC_API_KEY"] = saved

    # ── Catalog context grounds the model in the 20 Foundry types ───────
    ctx = studio._catalog_context()
    check("catalog context lists Foundry templates", ctx.count("\n- ") == 20, f"lines={ctx.count(chr(10) + '- ')}")
    check("catalog context names a known template", "web-spider" in ctx)

    # ── JSON parser tolerates fences, bare JSON, and prose wrapping ─────
    worker = '{"filename":"x.py","runtime":"python","code":"print(1)","run":"python3 x.py","needs":[],"notes":"n"}'
    check("parse bare JSON", _parse_worker_json(worker)["filename"] == "x.py")
    check("parse fenced JSON", _parse_worker_json("```json\n" + worker + "\n```")["runtime"] == "python")
    check("parse prose-wrapped JSON",
          _parse_worker_json("Here you go:\n" + worker + "\nHope that helps!")["code"] == "print(1)")
    check("parse garbage returns None", _parse_worker_json("not json at all") is None)

    # ── Real generation (only if a key is present) ─────────────────────
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            spec = studio.generate(
                "A tiny Python worker that reads URLs from stdin and prints "
                "each URL's HTTP status as JSON lines. Stdlib only.",
                max_tokens=2000)
            check("real generation returns filename + code",
                  bool(spec.get("filename")) and bool(spec.get("code")))
            if spec.get("runtime") == "python" and spec.get("code"):
                tmp = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False)
                tmp.write(spec["code"]); tmp.close()
                try:
                    py_compile.compile(tmp.name, doraise=True)
                    ok, detail = True, ""
                except py_compile.PyCompileError as e:
                    ok, detail = False, str(e)
                check("generated python worker compiles", ok, detail)
                os.unlink(tmp.name)
        except StudioError as e:
            check("real generation succeeded", False, str(e))
    else:
        print("SKIP: ANTHROPIC_API_KEY not set — skipping the live generation check "
              "(the honest-failure path above is what runs without a key).")

    print()
    if failures:
        print(f"RESULT: {len(failures)} FAILED: {failures}")
        raise SystemExit(1)
    print("RESULT: Worker Studio is honest without a key (clear error, never a fake worker), "
          "grounds Claude in the 20-template Foundry catalog, and robustly parses the generated "
          "worker JSON. With a key set it generates a real, compiling worker.")


if __name__ == "__main__":
    run()
