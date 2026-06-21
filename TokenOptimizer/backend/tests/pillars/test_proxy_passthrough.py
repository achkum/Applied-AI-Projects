import json

import httpx
import pytest
from fastapi import FastAPI, Request, Response
from tokenoptim.pillars.proxy.server import app_factory


def make_mock_upstream() -> FastAPI:
    mock = FastAPI()

    @mock.post("/v1/messages")
    async def messages(request: Request) -> Response:
        body = await request.body()
        # Echo the body back and surface the auth header so the test can assert it arrived.
        return Response(
            content=body,
            status_code=200,
            headers={"x-echo-auth": request.headers.get("authorization", "")},
        )

    @mock.post("/v1/chat/completions")
    async def chat(request: Request) -> Response:
        return Response(content=b'{"error":"rate limited"}', status_code=429)

    return mock


@pytest.fixture
def proxy_client(monkeypatch):
    monkeypatch.setenv("TS_ANTHROPIC_UPSTREAM", "http://upstream.mock")
    monkeypatch.setenv("TS_OPENAI_UPSTREAM", "http://upstream.mock")
    app = app_factory()
    app.state.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=make_mock_upstream()))
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://proxy")


async def test_body_semantically_round_trips(proxy_client):
    # With the engine wired in (T17) the proxy re-serializes JSON, so the forwarded body is
    # semantically equal rather than byte-identical. Non-JSON bodies pass through byte-exact
    # (covered by test_malformed_body_forwarded_untouched in test_proxy_optimized.py).
    payload = {"model": "claude-sonnet-4-5", "messages": [{"role": "user", "content": "hi"}]}
    resp = await proxy_client.post("/v1/messages", content=json.dumps(payload).encode())
    assert resp.status_code == 200
    assert json.loads(resp.content) == payload


async def test_auth_header_reaches_upstream(proxy_client):
    resp = await proxy_client.post(
        "/v1/messages", content=b"{}", headers={"authorization": "Bearer sk-secret"}
    )
    assert resp.headers["x-echo-auth"] == "Bearer sk-secret"


async def test_upstream_429_surfaces(proxy_client):
    resp = await proxy_client.post("/v1/chat/completions", content=b"{}")
    assert resp.status_code == 429
    assert b"rate limited" in resp.content


async def test_streaming_is_supported(proxy_client):
    # T16 added streaming support, so a stream request is no longer rejected with 501.
    resp = await proxy_client.post("/v1/messages", content=b'{"stream":true}')
    assert resp.status_code == 200
