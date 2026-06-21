# Compression service + engine demo (Cloud Run). Secret-free: holds no API keys and never
# forwards to an LLM. Runs the LLMLingua-2 compression model and the optimization engine.
#   docker build -f backend/Dockerfile -t <image> TokenOptimizer
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PORT=8080

WORKDIR /srv/backend

COPY backend/pyproject.toml ./
COPY backend/cutok ./cutok

# `serve` extra pulls onnxruntime + transformers + google-cloud-storage for the model service.
RUN uv sync --no-dev --extra serve

EXPOSE 8080
# Cloud Run injects $PORT. The model is loaded at startup from $TS_MODEL_GCS (set in the deploy
# workflow); without it the service still runs and returns text unchanged for /v1/compress.
CMD ["uv", "run", "--no-dev", "cutok", "web"]
