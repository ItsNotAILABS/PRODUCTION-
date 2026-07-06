# Aether Sovereign Platform — self-hosted container image.
# Zero pip dependencies: the whole backend is Python stdlib only.
FROM python:3.11-slim

WORKDIR /app
COPY . /app/aether_platform

ENV PYTHONUNBUFFERED=1
EXPOSE 7700

CMD ["python3", "-m", "aether_platform.api.server"]
