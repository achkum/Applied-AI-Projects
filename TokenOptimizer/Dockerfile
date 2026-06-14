# Hosted engine demo (Cloud Run). Secret-free: this image runs the optimization engine only and
# never forwards to an LLM, so it carries no API keys.
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PORT=8080

WORKDIR /app

# Dependency manifest + sources (shared/ holds compression_rules.json, read at runtime).
COPY pyproject.toml README.md ./
COPY src ./src
COPY shared ./shared

RUN uv sync --no-dev

EXPOSE 8080
# Cloud Run injects $PORT; `token-saver web` binds 0.0.0.0:$PORT.
CMD ["uv", "run", "--no-dev", "token-saver", "web"]
