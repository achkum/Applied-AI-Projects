import base64
import json

import httpx
import pytest
from fastapi import FastAPI, Request, Response
from tokenoptim.pillars.proxy.server import app_factory

DOC = {"users": [{"id": i, "name": f"user {i}", "active": True} for i in range(15)]}
PRETTY = json.dumps(DOC, indent=4)
MINIFIED = json.dumps(DOC, separators=(",", ":"))


def make_echo_upstream() -> FastAPI:
    mock = FastAPI()

    @mock.post("/v1/messages")
    async def messages(request: Request) -> Response:
        body = await request.body()
        return Response(content=body, status_code=200, media_type="application/json")

    return mock


@pytest.fixture
def proxy_client(monkeypatch, tmp_path):
    monkeypatch.setenv("TS_ANTHROPIC_UPSTREAM", "http://upstream.mock")
    monkeypatch.setenv("TS_LOG_DIR", str(tmp_path / "logs"))
    app = app_factory()
    app.state.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=make_echo_upstream()))
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://proxy")
    return client, app


async def test_document_block_minified_before_forwarding(proxy_client):
    client, app = proxy_client
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
                            "data": base64.b64encode(PRETTY.encode()).decode(),
                        },
                    },
                    {"type": "text", "text": "Summarize the users."},
                ],
            }
        ],
    }
    resp = await client.post("/v1/messages", content=json.dumps(payload).encode())
    assert resp.status_code == 200
    forwarded = json.loads(resp.content)
    # The document block was replaced by a text block carrying the minified JSON.
    text_block = forwarded["messages"][0]["content"][0]
    assert text_block["type"] == "text"
    assert text_block["text"] == MINIFIED
    assert "\n    " not in text_block["text"]  # no 4-space indentation remains

    stats = (await client.get("/stats")).json()
    assert stats["tokens_saved"] > 0
    assert stats["calls"] == 1


async def test_malformed_body_forwarded_untouched(proxy_client):
    client, _ = proxy_client
    raw = b"this is not json at all {{{"
    resp = await client.post("/v1/messages", content=raw)
    assert resp.status_code == 200
    assert resp.content == raw


async def test_stats_page_renders(proxy_client):
    client, _ = proxy_client
    resp = await client.get("/")
    assert resp.status_code == 200
    assert "tokens saved this session" in resp.text


async def test_savings_log_written(proxy_client, tmp_path):
    client, _ = proxy_client
    payload = {
        "model": "claude-sonnet-4-5",
        "messages": [{"role": "user", "content": [
            {"type": "document", "source": {"type": "base64", "media_type": "application/json",
                                            "data": base64.b64encode(PRETTY.encode()).decode()}},
        ]}],
    }
    await client.post("/v1/messages", content=json.dumps(payload).encode())
    log_file = tmp_path / "logs" / "log.jsonl"
    assert log_file.exists()
    lines = log_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert any(r["feature"] == "normalization" for r in record)
