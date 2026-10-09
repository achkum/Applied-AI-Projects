ARG PYTHON_BASE_IMAGE=python:3.12-slim
FROM ${PYTHON_BASE_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

RUN pip install --no-cache-dir uv==0.12.19
COPY services/ml/pyproject.toml services/ml/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY services/ml/app ./app
COPY packages/catalog/data/merchants.yaml ./data/merchants.yaml

EXPOSE 8000
CMD ["uv", "run", "--frozen", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
