"""Live registry of every library the platform actually imports, across every
language in the stack. Scanned from the real manifest files on disk (never
hand-maintained), so it can't drift from what's actually running.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent.parent  # apps/weekly-command-center

REQUIREMENTS_RE = re.compile(r"^([A-Za-z0-9_.\-]+)(?:\[[\w,\-]+\])?\s*([><=!~]{1,2}=?\s*[\w.\-]*)?")
CABAL_DEP_RE = re.compile(r"^\s*,?\s*([A-Za-z0-9_\-]+)\s*(>=|==|<)?\s*([\d.]*)")


def scan() -> list[dict]:
    entries: list[dict] = []
    entries += _scan_python_requirements()
    entries += _scan_node_packages()
    entries += _scan_julia_project()
    entries += _scan_haskell_cabal()
    return entries


def _scan_python_requirements() -> list[dict]:
    out = []
    for req_file in APP_ROOT.rglob("requirements*.txt"):
        for line in req_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = REQUIREMENTS_RE.match(line)
            if not m:
                continue
            name, version = m.group(1), (m.group(2) or "").strip()
            out.append({
                "language": "python",
                "name": name,
                "version": version or "unpinned",
                "source_file": str(req_file.relative_to(APP_ROOT)),
            })
    return out


def _scan_node_packages() -> list[dict]:
    out = []
    for pkg_file in APP_ROOT.rglob("package.json"):
        if "node_modules" in pkg_file.parts:
            continue
        try:
            data = json.loads(pkg_file.read_text())
        except json.JSONDecodeError:
            continue
        for section in ("dependencies", "devDependencies"):
            for name, version in data.get(section, {}).items():
                out.append({
                    "language": "node",
                    "name": name,
                    "version": version,
                    "source_file": str(pkg_file.relative_to(APP_ROOT)),
                })
    return out


def _scan_julia_project() -> list[dict]:
    out = []
    for proj_file in APP_ROOT.rglob("Project.toml"):
        text = proj_file.read_text()
        in_deps = False
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("[deps]"):
                in_deps = True
                continue
            if stripped.startswith("["):
                in_deps = False
                continue
            if in_deps and "=" in stripped:
                name = stripped.split("=", 1)[0].strip()
                out.append({
                    "language": "julia",
                    "name": name,
                    "version": "project-pinned",
                    "source_file": str(proj_file.relative_to(APP_ROOT)),
                })
    return out


def _scan_haskell_cabal() -> list[dict]:
    """Cabal fields are indentation-siblings, not scope-delimited, so the only
    reliable "still inside build-depends" signal is that continuation lines
    start with a comma once the field name + colon has been stripped off.
    """
    out = []
    for cabal_file in APP_ROOT.rglob("*.cabal"):
        in_build_depends = False
        for raw_line in cabal_file.read_text().splitlines():
            stripped = raw_line.strip()
            if stripped.lower().startswith("build-depends"):
                in_build_depends = True
                stripped = stripped.split(":", 1)[-1] if ":" in stripped else ""
            elif not (in_build_depends and stripped.startswith(",")):
                in_build_depends = False
                continue
            if in_build_depends:
                for part in stripped.split(","):
                    m = CABAL_DEP_RE.match(part)
                    if m and m.group(1):
                        out.append({
                            "language": "haskell",
                            "name": m.group(1).strip(),
                            "version": (m.group(3) or "").strip() or "unpinned",
                            "source_file": str(cabal_file.relative_to(APP_ROOT)),
                        })
    return out


def persist(conn) -> int:
    entries = scan()
    conn.execute("DELETE FROM libraries_cache")
    conn.executemany(
        "INSERT INTO libraries_cache (language, name, version, source_file) VALUES (?, ?, ?, ?)",
        [(e["language"], e["name"], e["version"], e["source_file"]) for e in entries],
    )
    conn.commit()
    return len(entries)
