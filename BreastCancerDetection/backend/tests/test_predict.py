from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_predict_returns_valid_classification(png_bytes):
    resp = client.post("/predict", files={"file": ("slide.png", png_bytes, "image/png")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["class"] in {"benign", "malignant"}
    assert 0.0 <= body["confidence"] <= 1.0
    assert 0.0 <= body["probability_malignant"] <= 1.0
    assert body["tier"] in {"confident_benign", "uncertain_review", "confident_malignant"}
    assert body["prediction_id"]


def test_predict_rejects_non_image():
    resp = client.post("/predict", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert resp.status_code == 400


def test_predict_rejects_empty_file():
    resp = client.post("/predict", files={"file": ("slide.png", b"", "image/png")})
    assert resp.status_code == 400


def test_predict_rejects_corrupt_image():
    resp = client.post("/predict", files={"file": ("slide.png", b"not-a-png", "image/png")})
    assert resp.status_code == 400
