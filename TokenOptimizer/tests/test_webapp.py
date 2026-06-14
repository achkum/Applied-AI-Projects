import base64
import json

import httpx
import pytest

from token_saver.webapp import DEMO_MODELS, app_factory


@pytest.fixture
def client():
    app = app_factory()
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://demo"), app


async def test_healthz(client):
    c, _ = client
    assert (await c.get("/healthz")).json() == {"status": "ok"}


async def test_index_lists_models(client):
    c, _ = client
    html = (await c.get("/")).text
    for model in DEMO_MODELS:
        assert model in html


async def test_count_endpoint_reports_provider_and_exactness(client):
    c, _ = client
    gpt = (await c.post("/api/count", json={"text": "hello world", "model": "gpt-4o"})).json()
    assert gpt["exact"] is True and gpt["provider"] == "openai" and gpt["count"] > 0
    claude = (await c.post("/api/count", json={"text": "hello world", "model": "claude-sonnet-4-5"})).json()
    assert claude["exact"] is False


async def test_compress_endpoint_shrinks_and_aggressive_shrinks_more(client):
    c, _ = client
    text = "Hi there! I was wondering if you could basically help me. Thanks in advance!"
    safe = (await c.post("/api/compress", json={"text": text, "model": "gpt-4o"})).json()
    assert safe["tokens_after"] < safe["tokens_before"]
    assert "basically" in safe["text"]  # safe pass keeps intensifiers
    aggressive = (
        await c.post("/api/compress", json={"text": text, "model": "gpt-4o", "aggressive": True})
    ).json()
    assert aggressive["tokens_after"] <= safe["tokens_after"]
    assert "basically" not in aggressive["text"]


async def test_optimize_endpoint_minifies_document(client):
    c, app = client
    pretty = json.dumps({"users": [{"id": i, "name": f"u{i}"} for i in range(10)]}, indent=4)
    payload = {
        "model": "claude-sonnet-4-5",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/json",
                            "data": base64.b64encode(pretty.encode()).decode(),
                        },
                    }
                ],
            }
        ],
    }
    resp = (await c.post("/api/optimize", json={"payload": payload, "model": "claude-sonnet-4-5"})).json()
    block = resp["payload"]["messages"][0]["content"][0]
    assert block["type"] == "text"
    assert json.loads(block["text"]) == json.loads(pretty)  # value-identical, minified
    assert resp["tokens_saved"] > 0
    assert app.state.ledger.totals()["calls"] == 1


async def test_no_secrets_no_forwarding(client):
    # The demo app has no upstream client and never forwards — it only runs the engine.
    _, app = client
    assert not hasattr(app.state, "client")


def test_web_entrypoint_boots_and_serves():
    # The exact entrypoint the Cloud Run container runs (`token-saver web`) must bind and serve.
    import socket
    import threading
    import time

    import uvicorn

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    server = uvicorn.Server(
        uvicorn.Config(app_factory(), host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not server.started:
            time.sleep(0.05)
        assert server.started
        resp = httpx.get(f"http://127.0.0.1:{port}/healthz", timeout=5.0)
        assert resp.status_code == 200
    finally:
        server.should_exit = True
        thread.join(timeout=10)
