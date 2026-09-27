# SubTrack ML service

Python 3.12 service using FastAPI, with dependencies locked by `uv.lock`.

From this directory, install the locked dependencies and start the service locally:

```sh
uv sync --locked
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The service exposes `GET /healthz` and `GET /ml/v1/models`. Run its endpoint tests with `uv run --locked pytest`.
