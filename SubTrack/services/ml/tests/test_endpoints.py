from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_does_not_require_database() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_models_is_empty_before_registration() -> None:
    response = client.get("/ml/v1/models")

    assert response.status_code == 200
    assert response.json() == {"models": []}
