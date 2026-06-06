import base64

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def test_gradcam_returns_png_overlay(png_bytes):
    payload = {"image_base64": base64.b64encode(png_bytes).decode(), "overlay_opacity": 0.5}
    resp = client.post("/gradcam", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["attention_summary"]
    assert body["prediction_id"]
    decoded = base64.b64decode(body["heatmap_base64"])
    assert decoded.startswith(PNG_SIGNATURE)


def test_gradcam_rejects_bad_base64():
    resp = client.post("/gradcam", json={"image_base64": "%%%not-base64%%%"})
    assert resp.status_code == 400


def test_gradcam_rejects_non_image():
    payload = {"image_base64": base64.b64encode(b"not-an-image").decode()}
    resp = client.post("/gradcam", json=payload)
    assert resp.status_code == 400
