from fastapi import FastAPI

app = FastAPI(title="SubTrack ML Service", docs_url=None, redoc_url=None)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ml/v1/models")
def list_models() -> dict[str, list[dict[str, object]]]:
    return {"models": []}
