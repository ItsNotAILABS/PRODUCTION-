#!/usr/bin/env python3
"""
Task Scheduler — in-memory priority job scheduler. POST /submit {id, run_at
(unix ts, optional), command}; jobs run at their time (or immediately) in a
background thread pool. GET /status lists pending/running/done jobs. Generated
by the Aether Worker Foundry. Stdlib only.
"""
from __future__ import annotations
import argparse, heapq, json, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Scheduler:
    def __init__(self, workers):
        self.heap = []       # (run_at, seq, job)
        self.seq = 0
        self.jobs = {}       # id -> job dict (status tracking)
        self.lock = threading.Lock()
        self.cv = threading.Condition(self.lock)
        for _ in range(workers):
            threading.Thread(target=self._worker, daemon=True).start()

    def submit(self, job_id, command, run_at):
        with self.cv:
            self.seq += 1
            job = {"id": job_id, "command": command, "run_at": run_at, "status": "pending"}
            self.jobs[job_id] = job
            heapq.heappush(self.heap, (run_at, self.seq, job))
            self.cv.notify()
        return job

    def _worker(self):
        while True:
            with self.cv:
                while not self.heap:
                    self.cv.wait()
                run_at = self.heap[0][0]
                now = time.time()
                if run_at > now:
                    self.cv.wait(timeout=run_at - now)
                    continue
                _, _, job = heapq.heappop(self.heap)
            job["status"] = "running"
            t0 = time.time()
            try:
                p = subprocess.run(job["command"], shell=True, capture_output=True,
                                    text=True, timeout=300)
                job["status"] = "done"
                job["exit_code"] = p.returncode
                job["stdout"] = p.stdout[-4000:]
                job["stderr"] = p.stderr[-4000:]
            except Exception as e:
                job["status"] = "failed"
                job["error"] = str(e)
            job["duration_s"] = round(time.time() - t0, 3)

    def status(self):
        with self.lock:
            return list(self.jobs.values())


def make_handler(sched):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _json(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != "/submit":
                return self._json(404, {"error": "not found"})
            length = int(self.headers.get("Content-Length", 0) or 0)
            try:
                data = json.loads(self.rfile.read(length) or b"{}")
            except Exception:
                return self._json(400, {"error": "invalid json"})
            job_id = str(data.get("id") or f"job-{time.time_ns()}")
            command = data.get("command")
            if not command:
                return self._json(400, {"error": "command required"})
            run_at = float(data.get("run_at") or time.time())
            job = sched.submit(job_id, command, run_at)
            self._json(202, job)

        def do_GET(self):
            if self.path != "/status":
                return self._json(404, {"error": "not found"})
            self._json(200, {"jobs": sched.status()})

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default={{PORT}})
    ap.add_argument("--workers", type=int, default={{WORKERS}})
    a = ap.parse_args()
    sched = Scheduler(a.workers)
    srv = ThreadingHTTPServer(("0.0.0.0", a.port), make_handler(sched))
    print(f"[task-scheduler] :{a.port}  workers={a.workers}  POST /submit  GET /status")
    srv.serve_forever()


if __name__ == "__main__":
    main()
