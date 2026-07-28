"""
Worker Studio — Claude, embedded in the platform, builds custom workers.

The Foundry (aether_platform/foundry) ships 40 ready-made worker types. The
Studio covers everything the catalog doesn't: describe what you want in plain
language — "a spider that logs into my dashboard and exports the CSV every
hour", "a headless node that renders our marketing pages to PDF" — and Claude
writes a real, self-contained worker in the Foundry's house style, which you
can then download and run (or hand back to the Foundry to re-render).

Design choices that matter:

  * HONEST about credentials. Generation needs an Anthropic API key
    (ANTHROPIC_API_KEY, or passed per-request). With no key it returns a clear
    error — never a fake/placeholder worker. The user actually runs these;
    a stub would be worse than nothing.
  * Zero-dependency. The platform runs on stdlib only (and at the edge on
    Cloudflare Workers), so this calls the Messages API over raw HTTPS via
    urllib rather than pulling in the `anthropic` SDK. Same wire contract.
  * Grounded in the Foundry. The catalog of existing templates is given to
    Claude as context so generated workers match the conventions the rest of
    the platform already uses (argparse defaults, stdlib-first, JSONL output,
    the mesh claim/submit loop, Playwright launch-with-fallback, etc.).

Default model: claude-opus-4-8.
"""
from __future__ import annotations

import io
import json
import os
import re
import stat
import urllib.error
import urllib.request
import zipfile
from typing import Optional

from aether_platform.foundry import Foundry

_API = "https://api.anthropic.com/v1/messages"
_DEFAULT_MODEL = "claude-opus-4-8"

_SYSTEM = """\
You are the Worker Studio for the Aether Sovereign Platform. You write real,
self-contained "headless workers" — small programs a developer downloads and
runs to do one job unattended (compute nodes, web spiders, scrapers, browser
automation, data/ETL jobs, monitors, relays, LLM/embedding pipelines).

House style (match it):
- Prefer the Python standard library only; no third-party deps unless the job
  truly needs them (Playwright for real-browser work; note it in `needs`).
- One self-contained file with an argparse CLI whose defaults come from the
  user's request, so it runs out of the box and every knob is also a flag.
- Emit progress/results as JSON lines to stdout; errors to stderr.
- For a mesh compute node: claim -> compute -> submit against a coordinator's
  /mesh/claim and /mesh/submit endpoints.
- For headless-browser work: Node + Playwright, launching headless Chromium
  with a fallback executablePath, capturing console + network.
- Be honest about anything that needs a credential or an external endpoint.

Return ONLY a single JSON object, no prose, with these fields:
  "filename":  a good filename (e.g. "spider.py", "screenshot.js")
  "runtime":   "python" or "node"
  "code":      the complete file contents as a string
  "run":       the exact shell command to run it
  "needs":     array of short strings — deps/keys/services required (may be [])
  "notes":     one or two sentences on what it does and how to adapt it
"""


_CONFIGURE_SYSTEM = """\
You recommend parameter values for an EXISTING Aether Worker Foundry
blueprint, given what the operator says they want it to do. You are not
writing code — the blueprint's code is fixed; you are only choosing good
values for its declared parameters.

Return ONLY a single JSON object, no prose:
  "params":    an object mapping ONLY the declared parameter names (exactly
               as given) to recommended string values. Do not invent new
               parameter names. Omit a parameter to leave it at its default.
  "rationale": one or two sentences explaining the choices, in plain language.
"""

_REMIX_SYSTEM = """\
You extend or adapt an EXISTING Aether Worker Foundry blueprint into a new,
complete worker. You are given the blueprint's real source file as a starting
point — keep what already works, change only what the request asks for, and
keep the same house style (argparse CLI, JSONL to stdout, stdlib-first).

Return ONLY a single JSON object, no prose, with these fields:
  "filename":  a good filename for the new worker (e.g. "spider.py")
  "runtime":   "python" or "node"
  "code":      the complete, updated file contents as a string
  "run":       the exact shell command to run it
  "needs":     array of short strings — deps/keys/services required (may be [])
  "notes":     one or two sentences on what changed from the base blueprint
"""


class StudioError(RuntimeError):
    pass


class WorkerStudio:
    def __init__(self, foundry: Optional[Foundry] = None, model: str = _DEFAULT_MODEL):
        self.foundry = foundry or Foundry()
        self.model = model

    # ── context ─────────────────────────────────────────────────────────
    def _catalog_context(self) -> str:
        lines = ["Existing Foundry worker types (for style and to avoid "
                 "reinventing — if one already fits, say so in notes):"]
        for t in self.foundry.list_templates():
            lines.append(f"- {t['id']} ({t['runtime']}): {t['summary']}")
        return "\n".join(lines)

    # ── generation ──────────────────────────────────────────────────────
    def generate(self, prompt: str, api_key: Optional[str] = None,
                 model: Optional[str] = None, max_tokens: int = 8000,
                 timeout: float = 120.0) -> dict:
        """
        Turn a natural-language request into a worker. Returns a dict with
        filename/runtime/code/run/needs/notes. Raises StudioError with an
        actionable message if no API key is configured or the API/parse fails.
        """
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise StudioError(
                "no_api_key: Worker Studio needs an Anthropic API key to "
                "generate a worker. Set ANTHROPIC_API_KEY (or pass one in the "
                "request). The rest of the platform — the 40-template Foundry, "
                "the mesh, the browser tools — works without a key.")
        if not prompt or not prompt.strip():
            raise StudioError("empty_prompt: describe the worker you want.")

        payload = {
            "model": model or self.model,
            "max_tokens": max_tokens,
            "system": _SYSTEM,
            "messages": [{
                "role": "user",
                "content": f"{self._catalog_context()}\n\n"
                           f"Build this worker:\n{prompt.strip()}",
            }],
        }
        data = json.dumps(payload).encode()
        req = urllib.request.Request(_API, data=data, method="POST", headers={
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = json.loads(r.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            raise StudioError(f"api_error {e.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            raise StudioError(f"network_error: {e}") from None

        text = "".join(b.get("text", "") for b in body.get("content", [])
                       if b.get("type") == "text").strip()
        spec = _parse_worker_json(text)
        if spec is None:
            raise StudioError("parse_error: model did not return a worker "
                              "object. Raw response head: " + text[:200])

        # Normalize + validate the shape so callers can trust it.
        spec.setdefault("runtime", "python")
        spec.setdefault("needs", [])
        spec.setdefault("notes", "")
        spec.setdefault("run", "")
        if not spec.get("code") or not spec.get("filename"):
            raise StudioError("incomplete_worker: model omitted code/filename.")
        spec["usage"] = body.get("usage", {})
        spec["model"] = body.get("model", payload["model"])
        return spec

    # ── configure: recommend param values for an existing template ────────
    def configure(self, template_id: str, goal: str, api_key: Optional[str] = None,
                  model: Optional[str] = None, timeout: float = 60.0) -> dict:
        """
        Given an existing Foundry blueprint + a plain-language goal, ask
        Claude which parameter values best fit. Returns
        {template_id, params, rationale}. `params` only ever contains
        declared parameter names — anything else the model returns is
        dropped, so the result is always safe to hand straight to
        `Foundry.render()`.
        """
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise StudioError(
                "no_api_key: Worker Studio needs an Anthropic API key to "
                "recommend a configuration. Set ANTHROPIC_API_KEY (or pass "
                "one in the request).")
        if not goal or not goal.strip():
            raise StudioError("empty_goal: describe what you want this worker to do.")
        t = self.foundry.get(template_id)  # raises FoundryError if unknown

        blueprint = {
            "id": t["id"], "name": t["name"], "summary": t["summary"],
            "params": [{"name": p["name"], "label": p.get("label", p["name"]),
                        "default": p.get("default", ""), "help": p.get("help", "")}
                       for p in t.get("params", [])],
        }
        payload = {
            "model": model or self.model,
            "max_tokens": 1024,
            "system": _CONFIGURE_SYSTEM,
            "messages": [{
                "role": "user",
                "content": f"Blueprint:\n{json.dumps(blueprint, indent=2)}\n\n"
                           f"Goal:\n{goal.strip()}",
            }],
        }
        body = self._call(payload, key, timeout)
        text = "".join(b.get("text", "") for b in body.get("content", [])
                       if b.get("type") == "text").strip()
        spec = _parse_worker_json(text)
        if spec is None:
            raise StudioError("parse_error: model did not return a configuration "
                              "object. Raw response head: " + text[:200])

        declared = {p["name"] for p in t.get("params", [])}
        params = {k: str(v) for k, v in (spec.get("params") or {}).items() if k in declared}
        return {"template_id": template_id, "params": params,
                "rationale": spec.get("rationale", ""),
                "usage": body.get("usage", {}), "model": body.get("model", payload["model"])}

    # ── remix: adapt an existing template's real source into a new worker ──
    def remix(self, template_id: str, request: str, api_key: Optional[str] = None,
              model: Optional[str] = None, max_tokens: int = 8000,
              timeout: float = 120.0) -> dict:
        """
        Take an existing Foundry blueprint's actual source as a starting
        point and have Claude adapt it per `request`, returning a new,
        complete worker in the same shape as `generate()` (plus
        `base_template_id`). This is how "take one of the forty and make a
        new one" works — Claude edits real code, not a description of it.
        """
        key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise StudioError(
                "no_api_key: Worker Studio needs an Anthropic API key to "
                "remix a blueprint. Set ANTHROPIC_API_KEY (or pass one in "
                "the request).")
        if not request or not request.strip():
            raise StudioError("empty_request: describe the change you want.")
        t = self.foundry.get(template_id)  # raises FoundryError if unknown
        rendered = self.foundry.render(template_id)
        base_source = rendered["files"].get(rendered["entry"], "")

        payload = {
            "model": model or self.model,
            "max_tokens": max_tokens,
            "system": _REMIX_SYSTEM,
            "messages": [{
                "role": "user",
                "content": f"Base blueprint: {t['id']} — {t['summary']}\n\n"
                           f"```{rendered['entry'].rsplit('.', 1)[-1]}\n{base_source}\n```\n\n"
                           f"Requested change:\n{request.strip()}",
            }],
        }
        body = self._call(payload, key, timeout)
        text = "".join(b.get("text", "") for b in body.get("content", [])
                       if b.get("type") == "text").strip()
        spec = _parse_worker_json(text)
        if spec is None:
            raise StudioError("parse_error: model did not return a worker "
                              "object. Raw response head: " + text[:200])

        spec.setdefault("runtime", t["runtime"])
        spec.setdefault("needs", t.get("needs", []))
        spec.setdefault("notes", "")
        spec.setdefault("run", "")
        if not spec.get("code") or not spec.get("filename"):
            raise StudioError("incomplete_worker: model omitted code/filename.")
        spec["base_template_id"] = template_id
        spec["usage"] = body.get("usage", {})
        spec["model"] = body.get("model", payload["model"])
        return spec

    # ── shared HTTP call ────────────────────────────────────────────────
    def _call(self, payload: dict, key: str, timeout: float) -> dict:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(_API, data=data, method="POST", headers={
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            raise StudioError(f"api_error {e.code}: {detail}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            raise StudioError(f"network_error: {e}") from None

    # ── delivery: bundle any Studio spec into a real, runnable zip ────────
    def bundle_zip(self, spec: dict) -> bytes:
        """
        Pack a `generate()`/`remix()` result into a zip — the worker file, a
        generated README.md, and an executable run.sh — the same shape as a
        Foundry download, so a Studio worker is exactly as ready-to-run as
        one of the 40 built-ins.
        """
        slug = re.sub(r"[^a-z0-9]+", "-", spec.get("filename", "worker").rsplit(".", 1)[0].lower()).strip("-") or "worker"
        filename = spec.get("filename", "worker.py")
        readme_lines = [
            f"# {slug}", "",
            spec.get("notes") or "Generated by the Aether Worker Studio.", "",
            f"- **Runtime:** {spec.get('runtime', 'python')}",
            f"- **Generated by:** Aether Worker Studio (Claude)",
        ]
        if spec.get("base_template_id"):
            readme_lines.append(f"- **Based on:** {spec['base_template_id']} (Worker Foundry)")
        readme_lines += ["", "## Run", "", "```bash", spec.get("run", ""), "```", ""]
        needs = spec.get("needs") or []
        if needs:
            readme_lines += ["## Requirements", ""] + [f"- {n}" for n in needs] + [""]
        readme = "\n".join(readme_lines)

        rt = spec.get("runtime", "python")
        run_pre = "#!/usr/bin/env bash\nset -euo pipefail\ncd \"$(dirname \"$0\")\"\n\n"
        if rt == "node":
            run_pre += "command -v node >/dev/null || { echo 'Node.js required'; exit 1; }\n"
            run_pre += "[ -d node_modules ] || npm i playwright\n"
        else:
            run_pre += "command -v python3 >/dev/null || { echo 'python3 required'; exit 1; }\n"
        run_sh = run_pre + spec.get("run", "") + "\n"

        files = {filename: spec.get("code", ""), "README.md": readme, "run.sh": run_sh}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for path, content in files.items():
                info = zipfile.ZipInfo(f"{slug}/{path}")
                info.external_attr = (stat.S_IFREG | 0o755) << 16 if path in (filename, "run.sh") \
                    else (stat.S_IFREG | 0o644) << 16
                z.writestr(info, content)
        return buf.getvalue()


def _parse_worker_json(text: str) -> Optional[dict]:
    """Parse the model's JSON worker object, tolerating fences/prose around it."""
    # Strip a ```json ... ``` fence if present.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    # Direct parse.
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        pass
    # Last resort: first balanced {...} span.
    start = text.find("{")
    if start >= 0:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        return None
    return None
