#!/usr/bin/env python3
"""
Process Watchdog — checks that a TCP port is accepting connections on an
interval; if it isn't, runs a restart command and fires a webhook. Generated
by the Aether Worker Foundry. Stdlib only.
"""
from __future__ import annotations
import argparse, json, socket, subprocess, sys, time
import urllib.request


def port_up(host, port, timeout):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, timeout=15).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="{{HOST}}")
    ap.add_argument("--port", type=int, default={{PORT}})
    ap.add_argument("--restart-command", default="{{RESTART_COMMAND}}")
    ap.add_argument("--interval", type=int, default={{INTERVAL}})
    ap.add_argument("--cooldown", type=int, default=30, help="seconds to wait after a restart before checking again")
    ap.add_argument("--webhook", default="{{WEBHOOK}}")
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()

    while True:
        up = port_up(a.host, a.port, 5)
        rec = {"host": a.host, "port": a.port, "up": up, "ts": time.time()}
        if not up:
            print(json.dumps(rec)); sys.stdout.flush()
            restart = {"event": "restart", "command": a.restart_command}
            try:
                p = subprocess.run(a.restart_command, shell=True, capture_output=True,
                                    text=True, timeout=120)
                restart["exit_code"] = p.returncode
            except Exception as e:
                restart["error"] = str(e)
            print(json.dumps(restart)); sys.stdout.flush()
            if a.webhook:
                try: post(a.webhook, {**rec, **restart})
                except Exception as e: print(json.dumps({"webhook_error": str(e)}), file=sys.stderr)
            if a.once:
                break
            time.sleep(a.cooldown)
            continue
        if a.once:
            print(json.dumps(rec))
            break
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
