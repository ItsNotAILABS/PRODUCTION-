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
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any
from urllib.parse import urlsplit

from aether_platform.api.router import build_platform, handle

FLEET, ENGINE, POLICY = build_platform()


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

    def do_GET(self):
        path = urlsplit(self.path).path
        status, data = handle("GET", path, {}, FLEET, ENGINE, POLICY)
        self._send(status, data)

    def do_POST(self):
        path = urlsplit(self.path).path
        body = _read_body(self)
        status, data = handle("POST", path, body, FLEET, ENGINE, POLICY)
        self._send(status, data)


def run(host: str = "0.0.0.0", port: int = 7700) -> None:
    server = HTTPServer((host, port), PlatformHandler)
    print(f"Aether Platform API running on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
