# Services: Always-On Computation Engines & Workers

Weekly Command Center runs as a distributed system with multiple interdependent services:

1. **core-api** — FastAPI web service (2 gunicorn workers, load-balanced)
2. **core-worker** — Inner agent scheduler (housekeeping jobs)
3. **optimizer-julia** — Native week optimization engine (falls back to Python)
4. **taskrules-haskell** — Native task language parser (falls back to Python)

All services are monitored by supervisord and automatically restarted on failure. The system degrades gracefully if native computation engines go down — Python fallbacks keep the app fully functional.

## Local Development (run_local.sh)

The simplest way to run everything locally without Docker:

```bash
./run_local.sh
```

This starts:
- **core-api**: http://localhost:8000 (Python)
- **gateway-node**: http://localhost:3000 (Node frontend)
- *(Optional)* Julia + Haskell via: `docker compose up optimizer-julia taskrules-haskell`

All services log to stdout. Control+C stops everything gracefully.

## Docker Compose (local with sidecars)

```bash
docker-compose up
```

Starts all four services in separate containers with proper networking. Good for testing the full stack locally.

## Docker Compose Production

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Runs the production stack:
- Single gunicorn master (supervises multiple worker processes)
- Dedicated core-worker process for the scheduler
- Optional Julia/Haskell sidecars

## Cloudflare Containers (edge deployment)

All four services run inside a single container via supervisord:

```bash
wrangler deploy
```

See [CLOUDFLARE_DEPLOY.md](./apps/weekly-command-center/CLOUDFLARE_DEPLOY.md) for secrets setup and deployment details.

## Service Health & Monitoring

### Check System Health

```bash
curl http://localhost:8000/health/system
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-07-08T12:34:56.789123",
  "services": {
    "optimizer": {
      "name": "Julia Optimizer",
      "healthy": true,
      "last_checked": "2026-07-08T12:34:56.789123",
      "error": null,
      "engine": "native"
    },
    "parser": {
      "name": "Haskell Parser",
      "healthy": true,
      "last_checked": "2026-07-08T12:34:56.789123",
      "error": null,
      "engine": "native"
    }
  },
  "message": "All computation engines running natively"
}
```

Status codes:
- **healthy**: All native services (Julia, Haskell) are reachable and responding
- **degraded**: Some native services are offline; system using Python fallbacks
- **critical**: All native services offline; running on Python-only (system still fully functional)

### Liveness & Readiness Probes

For Kubernetes or container orchestration:

```bash
curl http://localhost:8000/health          # Liveness (app running?)
curl http://localhost:8000/health/ready     # Readiness (app ready to serve?)
curl http://localhost:8000/health/system    # Detailed system status
```

## Supervisord Management (Cloudflare Containers)

Inside a running container, use `supervisorctl` to manage processes:

```bash
supervisorctl status                    # See all running processes
supervisorctl start core-api            # Start a specific process
supervisorctl stop optimizer-julia      # Stop a service
supervisorctl restart core-worker       # Restart a service
supervisorctl update                    # Reload config and restart changed services
```

View logs:

```bash
tail -f /app/core-api/logs/*            # Core API logs (docker-compose)
docker logs <container-id>              # View container stdout/stderr
```

## Service Restart Policies

Each service is configured to:
- Start automatically when the container/process manager starts (`autostart=true`)
- Restart automatically if it crashes (`autorestart=true`)
- Wait for startup completion (`startsecs=<N>` seconds before marking as running):
  - **core-api**: 5 seconds (Gunicorn startup)
  - **core-worker**: 5 seconds (Database initialization)
  - **optimizer-julia**: 10 seconds (Julia JIT compilation)
  - **taskrules-haskell**: 5 seconds (Haskell startup)

If a service exceeds its startup window repeatedly (>10 tries in 60 seconds), supervisord marks it as failed and logs the error.

## Graceful Shutdown

When stopping services (docker stop, SIGTERM, etc.):

1. supervisord sends SIGTERM to all processes
2. Processes have 10 seconds to shut down gracefully
3. After 10 seconds, supervisord sends SIGKILL to remaining processes
4. Container exits cleanly

The core-worker process catches SIGTERM and completes the current job before exiting. In-flight HTTP requests to core-api complete gracefully (Gunicorn drain mode).

## Python Fallbacks (Always Available)

If Julia or Haskell services are unavailable:

### Missing Julia Optimizer
The system uses a Python deadline-weighted greedy scheduler instead:
- Allocates tasks across Mon-Fri based on deadline and priority
- Returns {"engine": "python-fallback", "plan": {...}}
- Functionally equivalent, slightly less optimal scheduling

### Missing Haskell Parser
The system uses a Python regex-based parser instead:
- Parses the same task DSL (due:, !priority, ~estimate, etc.)
- Returns {"engine": "python-fallback", "title": "...", ...}
- Functionally equivalent, no language-specific features

**The app is fully functional even if all native services are offline.** Health checks show "critical" status, but users experience no outage.

## Load Balancing & Concurrency

### core-api (2 Gunicorn Workers)

Gunicorn load-balances HTTP requests across 2 worker processes:

```
Worker 1 \
          > Gunicorn Master (bind 0.0.0.0:8000)
Worker 2 /
```

Each worker is an asyncio event loop (uvicorn) that handles concurrent requests. With 2 workers + async, the API can handle thousands of concurrent users.

Add more workers for higher throughput:

**docker-compose.yml**: Edit `core-api` → `gunicorn ... --workers 4`
**supervisord.conf**: Edit `command=gunicorn ... --workers 4`
**Cloudflare**: Increase `instance_type` in wrangler.toml (standard-2 or standard-3)

### core-worker (Single Process)

The scheduler runs in a single process to avoid firing housekeeping jobs N times:
- Never parallel — strictly sequential per-account
- If it goes down, supervisord restarts it
- Blocking operations (DB queries) don't block other workers (separate process)

If housekeeping becomes too slow (e.g. millions of accounts), split into sharded workers:

```ini
[group:core-workers]
programs=core-worker-0,core-worker-1,core-worker-2

[program:core-worker-0]
command=python3 worker.py
environment=WORKER_SHARD="0/3",WORKER_ID="shard-0"

[program:core-worker-1]
command=python3 worker.py
environment=WORKER_SHARD="1/3",WORKER_ID="shard-1"

[program:core-worker-2]
command=python3 worker.py
environment=WORKER_SHARD="2/3",WORKER_ID="shard-2"
```

(See core-api/worker.py for WORKER_SHARD handling — currently not implemented but designed with this in mind.)

## Debugging & Logs

### View real-time logs (local dev)

```bash
./run_local.sh   # All services log to stdout, grouped by service
```

### View logs in docker-compose

```bash
docker-compose logs -f core-api      # Follow core-api logs
docker-compose logs -f --tail=100    # Last 100 lines of all services
docker-compose logs core-worker | grep "housekeeping"  # Grep for specific events
```

### View logs in Cloudflare Container

Container stdout goes to the Cloudflare dashboard or your observability tool (Datadog, Sentry, etc.).

### Debug a service

SSH into running container/machine:

```bash
# Docker
docker exec -it <container-id> bash

# Kubernetes
kubectl exec -it <pod-name> -- bash

# Direct SSH (for VMs)
ssh user@host
```

Check supervisord status:

```bash
supervisorctl status
supervisorctl tail -f core-api          # Live tail of core-api stderr
supervisorctl tail core-api 100         # Last 100 lines of stderr
```

## Service Dependencies & Startup Order

**No hard dependencies** — any service can start in any order.

- **core-api** needs **optimizer-julia** + **taskrules-haskell** to be reachable for best performance, but works fine with Python fallbacks if they're not
- **core-worker** needs **core-api** to not be serving requests (separate process, safe)
- **optimizer-julia** is standalone (no dependencies)
- **taskrules-haskell** is standalone (no dependencies)

Supervisord starts all services concurrently but respects `priority` and `startsecs` to avoid race conditions. Process groups allow coordinated start/stop (e.g., restart all computation engines).

## Connection Pooling & Resource Management

- **SQLAlchemy**: 5-connection pool per worker (Gunicorn + uvicorn)
- **Julia optimizer**: ~200 MB RAM (JIT compilation cache, shared across requests)
- **Haskell parser**: ~50 MB RAM
- **Python processes**: ~100-200 MB each (core-api worker, core-worker)

In Cloudflare Containers with `instance_type = "standard-1"` (1 vCPU, 4 GB RAM), comfortably handles ~1000 concurrent users with native sidecars.

## Health Checks & Alerting

Set up monitoring:

```bash
# Prometheus scrape config
curl http://localhost:8000/health/system

# Datadog agent
check_http:
  instances:
    - name: wcc-health
      url: http://localhost:8000/health/system
      alert_type: status

# Kubernetes probe
livenessProbe:
  httpGet:
    path: /health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 5
```

Alert when:
- `/health/system` status != "healthy" (Julia or Haskell down)
- `/health/ready` returns non-200 (app not ready)
- core-worker logs "housekeeping failed" (jobs crashing)
- core-api has >10s response time (GC or overload)

## Future Improvements

- [ ] Add distributed tracing (OpenTelemetry) to track requests across services
- [ ] Implement core-worker sharding for millions of accounts
- [ ] Add Prometheus metrics endpoint (/metrics)
- [ ] Implement cross-service timeout propagation
- [ ] Add circuit breakers for native service calls (fail-fast fallback)
- [ ] Stream large task lists instead of loading into memory
- [ ] Add service versioning for rolling updates
