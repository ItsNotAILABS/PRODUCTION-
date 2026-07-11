"""
Aether Platform REST API — self-hosted stdlib HTTP transport.

Thin adapter over router.handle() — all route logic lives in router.py so
it's shared byte-for-byte with the Cloudflare Python Workers transport
(worker.py). This file only handles socket I/O: parsing the request,
calling the router, writing the response.

Zero external dependencies — standard library http.server only.

Run:  python3 -m aether_platform.api.server
"""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlsplit

from aether_platform.api.router import build_platform, handle

FLEET, ENGINE, POLICY = build_platform()

# Serve the console UI (apps/aether-console) from this same process, so one
# command gives a whole working platform — dashboard + Fleet + Worker Foundry +
# Studio — with no separate static host. Resolved relative to the repo root.
_CONSOLE_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "aether-console"))
_STATIC_MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
}


def _json(data: Any) -> bytes:
    return json.dumps(data, indent=2).encode()


def _read_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw)


class PlatformHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def _send(self, code: int, data: Any) -> None:
        body = _json(data)
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _serve_static(self, path: str) -> bool:
        """Serve the console UI for non-/api GETs. Returns True if handled."""
        rel = "index.html" if path == "/" else path.lstrip("/")
        resolved = os.path.normpath(os.path.join(_CONSOLE_DIR, rel))
        if not resolved.startswith(_CONSOLE_DIR) or not os.path.isfile(resolved):
            return False
        with open(resolved, "rb") as f:
            body = f.read()
        ext = os.path.splitext(resolved)[1]
        self.send_response(200)
        self.send_header("Content-Type", _STATIC_MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        return True

    def do_GET(self):
        path = urlsplit(self.path).path
        if not path.startswith("/api/") and self._serve_static(path):
            return
        status, data = handle("GET", path, {}, FLEET, ENGINE, POLICY)
        self._send(status, data)

    def do_POST(self):
        path = urlsplit(self.path).path
        body = _read_body(self)
        status, data = handle("POST", path, body, FLEET, ENGINE, POLICY)
        self._send(status, data)


def run(host: str = "0.0.0.0", port: int = 7700) -> None:
    server = ThreadingHTTPServer((host, port), PlatformHandler)
    print(f"Aether Platform API running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
