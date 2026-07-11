# Kubernetes Deployment

Manifests for running Weekly Command Center on any Kubernetes cluster (EKS,
GKE, AKS, or self-hosted). Mirrors the topology in `docker-compose.prod.yml`:
Postgres, core-api, core-worker, optimizer-julia, taskrules-haskell,
gateway-node — plus autoscaling, health-check wiring, and TLS ingress that
docker-compose can't express.

## Files (apply in this order — the numeric prefixes match)

| File | Purpose |
|---|---|
| `00-namespace.yaml` | Creates the `weekly-command-center` namespace |
| `01-secrets.example.yaml` | Template — copy to `01-secrets.yaml`, fill in, **do not commit** |
| `02-configmap.yaml` | Non-secret config (CORS origin, internal service URLs) |
| `10-postgres.yaml` | Postgres StatefulSet + headless Service + PVC |
| `11-redis.yaml` | Optional — only used by supercompute/realtime features |
| `20-optimizer-julia.yaml` | Native Julia optimizer (2 replicas, Python fallback if down) |
| `21-taskrules-haskell.yaml` | Native Haskell parser (2 replicas, Python fallback if down) |
| `30-core-api.yaml` | FastAPI web service + HPA (2-10 replicas), Alembic migration initContainer |
| `31-core-worker.yaml` | Scheduler — **fixed at 1 replica**, never autoscale this |
| `32-gateway-node.yaml` | Static frontend + HPA (2-6 replicas) |
| `40-ingress.yaml` | TLS ingress (requires nginx-ingress + cert-manager) |

## First-time deploy

```bash
# 1. Build and push images to your registry
REGISTRY=ghcr.io/yourorg ./build-and-push.sh
sed -i "s|REGISTRY_PLACEHOLDER|ghcr.io/yourorg|g" *.yaml

# 2. Create secrets (don't commit the filled-in file)
cp 01-secrets.example.yaml 01-secrets.yaml
# edit 01-secrets.yaml with real values, or generate:
#   POSTGRES_PASSWORD / JWT_SECRET: openssl rand -hex 32

# 3. Point the ConfigMap and Ingress at your real domain
sed -i "s|app.yourdomain.com|your-real-domain.com|g" 02-configmap.yaml 40-ingress.yaml

# 4. Apply everything in order
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-secrets.yaml
kubectl apply -f 02-configmap.yaml
kubectl apply -f 10-postgres.yaml
kubectl apply -f 11-redis.yaml          # optional
kubectl apply -f 20-optimizer-julia.yaml
kubectl apply -f 21-taskrules-haskell.yaml
kubectl apply -f 30-core-api.yaml
kubectl apply -f 31-core-worker.yaml
kubectl apply -f 32-gateway-node.yaml
kubectl apply -f 40-ingress.yaml

# 5. Watch it come up
kubectl -n weekly-command-center get pods -w
```

Or apply the whole directory at once (kubectl applies in filename order for a
single directory, which is why everything is numerically prefixed):

```bash
kubectl apply -f .
```

## Verifying the deploy

```bash
# All pods running?
kubectl -n weekly-command-center get pods

# core-api healthy?
kubectl -n weekly-command-center port-forward svc/core-api 8000:8000 &
curl http://localhost:8000/health/system

# Migration ran cleanly? (check the initContainer logs on any core-api pod)
kubectl -n weekly-command-center logs deploy/core-api -c migrate

# Scheduler running exactly once?
kubectl -n weekly-command-center get deploy core-worker  # READY should be 1/1, never more
```

## Updating / rolling deploys

```bash
REGISTRY=ghcr.io/yourorg TAG=v1.2.3 ./build-and-push.sh
kubectl -n weekly-command-center set image deployment/core-api core-api=ghcr.io/yourorg/wcc-core-api:v1.2.3
kubectl -n weekly-command-center set image deployment/core-api migrate=ghcr.io/yourorg/wcc-core-api:v1.2.3
kubectl -n weekly-command-center rollout status deployment/core-api
```

The Alembic migration runs as an initContainer on every core-api pod, so a
rolling update always migrates before the new version serves traffic. This is
safe for additive migrations; for anything that drops/renames a column still
read by the old version, deploy in two phases (see `../ALEMBIC.md`).

## What's intentionally not here

- **Postgres HA / managed database**: the included StatefulSet is a single
  replica for getting started. For production, point `DATABASE_URL` at a
  managed Postgres (RDS, Cloud SQL, etc.) and delete `10-postgres.yaml` —
  nothing else in these manifests assumes in-cluster Postgres.
- **Stripe webhook exposure**: `40-ingress.yaml` routes `/api` to core-api,
  which includes `/billing/webhook/stripe` — just make sure the Stripe
  Dashboard webhook URL matches your real ingress host.
- **cert-manager / nginx-ingress installation**: assumed already installed
  on the cluster. If not: `kubectl apply -f
  https://github.com/kubernetes/ingress-nginx/.../deploy.yaml` and the
  [cert-manager install docs](https://cert-manager.io/docs/installation/).
- **GPU nodes for supercompute mode**: see `../SUPERCOMPUTER.md` — add a
  `nodeSelector`/`tolerations` + `nvidia.com/gpu` resource request to
  `30-core-api.yaml` if running with `ENABLE_GPU=true`.
