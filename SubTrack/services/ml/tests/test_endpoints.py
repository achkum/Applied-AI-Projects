from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_does_not_require_database() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_models_lists_registered_classifiers() -> None:
    response = client.get("/ml/v1/models")

    assert response.status_code == 200
    names = [m["name"] for m in response.json()["models"]]
    assert "subscription-classifier" in names
    assert "category-classifier" in names
