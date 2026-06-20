import asyncio

import httpx
import pytest
import tokenoptim.pillars.proxy.server as server
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from tokenoptim.pillars.proxy.server import app_factory

SSE_CHUNKS = [
    b"event: a\ndata: 1\n\n",
    b"event: b\nda",  # an event deliberately split across two chunks
    b"ta: 2\n\n",
    b"event: c\ndata: 3\n\n",
    b"event: d\ndata: 4\n\n",
    b"event: e\ndata: 5\n\n",
]
SSE_FULL = b"".join(SSE_CHUNKS)


def make_streaming_upstream() -> FastAPI:
    mock = FastAPI()

    @mock.post("/v1/messages")
    async def messages(request: Request) -> StreamingResponse:
        async def gen():
            for chunk in SSE_CHUNKS:
                yield chunk

        return StreamingResponse(gen(), media_type="text/event-stream")

    return mock


class _DyingStream(httpx.AsyncByteStream):
    """Yields a couple of chunks, then fails — simulating an upstream death mid-stream."""

    async def __aiter__(self):
        yield b"event: a\ndata: 1\n\n"
        yield b"event: b\ndata: 2\n\n"
        raise httpx.ReadError("upstream died mid-stream")

    async def aclose(self) -> None:
        pass


class DyingStreamTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, headers={"content-type": "text/event-stream"}, stream=_DyingStream()
        )


class FlakyConnectTransport(httpx.AsyncBaseTransport):
    """Raises ConnectError for the first N requests, then delegates to a real transport."""

    def __init__(self, inner: httpx.AsyncBaseTransport, fail_times: int) -> None:
        self.inner = inner
        self.remaining = fail_times

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if self.remaining > 0:
            self.remaining -= 1
            raise httpx.ConnectError("simulated connect failure", request=request)
        return await self.inner.handle_async_request(request)


def proxy_to(mock_app, client_transport=None):
    app = app_factory()
    app.state.anthropic_upstream = "http://upstream.mock"
    app.state.client = httpx.AsyncClient(
        transport=client_transport or httpx.ASGITransport(app=mock_app)
    )
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://proxy")


@pytest.fixture(autouse=True)
def fast_backoffs(monkeypatch):
    monkeypatch.setattr(server, "BACKOFFS", (0.0, 0.0))


async def test_sse_passthrough_byte_identical():
    client = proxy_to(make_streaming_upstream())
    resp = await client.post("/v1/messages", content=b'{"stream":true}')
    assert resp.status_code == 200
    assert resp.content == SSE_FULL


async def test_connect_error_then_success_is_transparent():
    inner = httpx.ASGITransport(app=make_streaming_upstream())
    flaky = FlakyConnectTransport(inner, fail_times=1)
    client = proxy_to(None, client_transport=flaky)
    resp = await client.post("/v1/messages", content=b'{"stream":true}')
    assert resp.status_code == 200
    assert resp.content == SSE_FULL


async def test_midstream_failure_does_not_hang():
    client = proxy_to(None, client_transport=DyingStreamTransport())

    async def do_request():
        resp = await client.post("/v1/messages", content=b'{"stream":true}')
        return resp.content

    # Guard with a timeout: a mid-stream failure must terminate, not hang.
    content = await asyncio.wait_for(do_request(), timeout=5.0)
    assert b"event: a" in content  # partial content delivered before the break


async def test_healthz():
    client = proxy_to(make_streaming_upstream())
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
