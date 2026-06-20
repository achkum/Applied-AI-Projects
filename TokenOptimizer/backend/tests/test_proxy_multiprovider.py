"""Real integration tests for multi-provider routing and measured (not guessed) cache savings."""

import json

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from tokenoptim.core.types import OptimizerConfig
from tokenoptim.pillars.proxy.server import app_factory


class RecordingTransport(httpx.AsyncBaseTransport):
    """Records the upstream URL each forwarded request targets, then delegates to a mock."""

    def __init__(self, inner: httpx.AsyncBaseTransport) -> None:
        self.inner = inner
        self.urls: list[str] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.urls.append(str(request.url))
        return await self.inner.handle_async_request(request)


def mock_upstream(*, usage=None, stream_text=None, echo=False) -> FastAPI:
    app = FastAPI()

    @app.post("/{path:path}")
    async def any_path(request: Request):
        if stream_text is not None:
            async def gen():
                yield stream_text.encode()

            return StreamingResponse(gen(), media_type="text/event-stream")
        if echo:
            return Response(content=await request.body(), media_type="application/json")
        body = {"ok": True}
        if usage is not None:
            body["usage"] = usage
        return JSONResponse(body)

    return app


def proxy_with(mock: FastAPI, *, config=None, recording=False):
    app = app_factory(config)
    inner = httpx.ASGITransport(app=mock)
    transport = RecordingTransport(inner) if recording else inner
    app.state.client = httpx.AsyncClient(transport=transport)
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://proxy")
    return client, app, transport


def chat_body(model):
    return json.dumps({"model": model, "messages": [{"role": "user", "content": "hi"}]}).encode()


@pytest.mark.parametrize(
    "model,path,expected_host",
    [
        ("gpt-4o", "/v1/chat/completions", "api.openai.com"),
        ("claude-sonnet-4-5", "/v1/messages", "api.anthropic.com"),
        ("mistral-large-latest", "/v1/chat/completions", "api.mistral.ai"),
        ("deepseek-chat", "/v1/chat/completions", "api.deepseek.com"),
        ("grok-2", "/v1/chat/completions", "api.x.ai"),
        ("command-r-plus", "/v1/chat/completions", "api.cohere.com"),
    ],
)
async def test_routes_each_provider_to_its_own_upstream(model, path, expected_host):
    client, _app, transport = proxy_with(mock_upstream(), recording=True)
    await client.post(path, content=chat_body(model))
    assert any(expected_host in url for url in transport.urls)


async def test_measures_anthropic_cache_read():
    usage = {"input_tokens": 100, "cache_read_input_tokens": 80, "output_tokens": 10}
    client, app, _ = proxy_with(mock_upstream(usage=usage))
    await client.post("/v1/messages", content=chat_body("claude-sonnet-4-5"))
    # Anthropic cache read is billed at 10% → 90% of 80 = 72 tokens measured-saved.
    assert app.state.ledger.totals()["by_feature"]["cache_optimization"] == 72


async def test_measures_openai_cache_read_at_half_discount():
    usage = {
        "prompt_tokens": 100,
        "completion_tokens": 10,
        "prompt_tokens_details": {"cached_tokens": 60},
    }
    client, app, _ = proxy_with(mock_upstream(usage=usage))
    await client.post("/v1/chat/completions", content=chat_body("gpt-4o"))
    # OpenAI cached tokens are ~50% off → 30 saved.
    assert app.state.ledger.totals()["by_feature"]["cache_optimization"] == 30


async def test_measures_cache_read_from_a_stream():
    stream = (
        'event: message_start\n'
        'data: {"type":"message_start","message":{"usage":'
        '{"input_tokens":100,"cache_read_input_tokens":80}}}\n\n'
        'event: message_stop\ndata: {}\n\n'
    )
    client, app, _ = proxy_with(mock_upstream(stream_text=stream))
    resp = await client.post(
        "/v1/messages",
        content=json.dumps(
            {"model": "claude-sonnet-4-5", "stream": True, "messages": [{"role": "user", "content": "hi"}]}
        ).encode(),
    )
    assert resp.content  # stream consumed
    assert app.state.ledger.totals()["by_feature"]["cache_optimization"] == 72


async def test_no_cache_savings_when_usage_absent():
    client, app, _ = proxy_with(mock_upstream(usage={"input_tokens": 50, "output_tokens": 5}))
    await client.post("/v1/messages", content=chat_body("claude-sonnet-4-5"))
    assert app.state.ledger.totals()["by_feature"].get("cache_optimization", 0) == 0


async def test_gemini_shaped_payload_passes_through_untouched():
    # Gemini uses `contents`/`generationConfig`, not `messages`. With a budget configured, we must
    # NOT inject an OpenAI/Anthropic field into it — it should forward byte-equivalent.
    client, _app, _ = proxy_with(
        mock_upstream(echo=True), config=OptimizerConfig(max_output_tokens=128)
    )
    payload = {"contents": [{"role": "user", "parts": [{"text": "hi"}]}]}
    resp = await client.post(
        "/v1beta/models/gemini-1.5-pro:generateContent", content=json.dumps(payload).encode()
    )
    assert json.loads(resp.content) == payload  # no max_completion_tokens / max_tokens injected
