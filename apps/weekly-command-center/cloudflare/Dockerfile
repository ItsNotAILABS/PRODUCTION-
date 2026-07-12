# Single container for Cloudflare Containers: core-api (Python/gunicorn),
# the inner-agent worker, the Julia optimizer, and the Haskell task-language
# parser, all as sidecar processes under supervisord. See
# supervisord/supervisord.conf for why this is one container instead of the
# four separate ones docker-compose.yml/.prod.yml use.
#
# Build context is the repo root (apps/weekly-command-center), so paths
# below are relative to that, e.g. `docker build -f cloudflare/Dockerfile .`

# --- Stage 1: compile the Haskell parser to a standalone binary -------------
FROM haskell:9.4-slim AS haskell-builder
WORKDIR /build
COPY taskrules-haskell/ .
RUN cabal update && cabal build --only-dependencies
RUN cabal build
RUN cp "$(cabal list-bin taskrules)" /taskrules-bin

# --- Stage 2: the runtime image ---------------------------------------------
FROM julia:1.10-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip supervisor curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Julia optimizer + its dependencies
COPY optimizer-julia/ /app/optimizer-julia/
RUN julia --project=/app/optimizer-julia -e 'import Pkg; Pkg.instantiate()'

# Python core-api + its dependencies
COPY core-api/ /app/core-api/
RUN pip3 install --no-cache-dir --break-system-packages -r /app/core-api/requirements.txt

# Compiled Haskell binary from stage 1
COPY --from=haskell-builder /taskrules-bin /app/taskrules-bin/taskrules
RUN chmod +x /app/taskrules-bin/taskrules

COPY cloudflare/supervisord/supervisord.conf /etc/supervisor/supervisord.conf

RUN mkdir -p /app/core-api/data/inbox

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/health || exit 1

CMD ["supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
