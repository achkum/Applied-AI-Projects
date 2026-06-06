# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# opencv (pulled in by pytorch-grad-cam) needs libGL and libglib at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# uv binary from the official distroless image.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies first (cached layer) — no project code yet, no dev deps.
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

# App code.
COPY app ./app

# Cloud Run injects PORT (default 8080).
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
