# Single-stage, no build tooling. Everything installs from wheels — the
# tree-sitter grammars ship precompiled — so the image needs no compiler and
# keeps a minimal attack surface, which matters when the whole enterprise pitch
# is "run this inside your own perimeter". No model weights, no CUDA, no egress.
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY loomcode/ ./loomcode/

# Data lives on a volume so the index survives container replacement.
ENV LOOM_DB=/data/loomcode.db
VOLUME ["/data"]

# LOOM_KEY_SALT must be set in production; the default is a dev placeholder
# and leaving it unset makes issued keys portable between deployments.
ENV LOOM_KEY_SALT=""

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8080/health').status==200 else 1)"

CMD ["uvicorn", "loomcode.api:app", "--host", "0.0.0.0", "--port", "8080"]
