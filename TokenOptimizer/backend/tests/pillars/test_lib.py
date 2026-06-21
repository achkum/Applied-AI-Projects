import base64
import json

import cutok as ts
import pytest


@pytest.fixture(autouse=True)
def _reset():
    ts.reset_savings()
    ts.configure(
        model="gpt-4o",
        enable_compression=False,
        inject_brevity=False,
        max_output_tokens=None,
        compress_url=None,
    )
    yield
    ts.configure(compress_url=None, enable_compression=False)


def doc_payload(model="gpt-4o"):
    pretty = json.dumps({"users": [{"id": i, "name": f"u{i}"} for i in range(10)]}, indent=4)
    payload = {
        "model": model,
        "temperature": 0.7,  # passthrough kwarg — must survive untouched
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
    return payload, pretty


# ---- functional: optimize() ----

def test_optimize_minifies_document_and_keeps_passthrough():
    payload, pretty = doc_payload()
    out = ts.optimize(**payload)
    block = out["messages"][0]["content"][0]
    assert block["type"] == "text"
    assert json.loads(block["text"]) == json.loads(pretty)  # value-identical
    assert "\n    " not in block["text"]  # minified
    assert out["temperature"] == 0.7  # passthrough preserved
    assert ts.savings()["tokens_saved"] > 0


def test_optimize_accepts_a_dict_too():
    payload, _ = doc_payload()
    out = ts.optimize(payload)  # positional dict form
    assert out["messages"][0]["content"][0]["type"] == "text"


def test_optimize_injects_provider_correct_output_cap():
    ts.configure(max_output_tokens=256)
    out_openai = ts.optimize(model="gpt-4o", messages=[{"role": "user", "content": "hi"}])
    assert out_openai["max_completion_tokens"] == 256
    out_mistral = ts.optimize(model="mistral-large-latest", messages=[{"role": "user", "content": "hi"}])
    assert out_mistral["max_tokens"] == 256  # not max_completion_tokens


# ---- universal: optimized() — works for ANY create-callable ----

def test_optimized_sync_wraps_any_callable():
    received = {}

    def fake_create(**kwargs):
        received.update(kwargs)
        return "response"

    create = ts.optimized(fake_create)
    payload, pretty = doc_payload()
    assert create(**payload) == "response"
    # The wrapped callable received the OPTIMIZED payload.
    assert received["messages"][0]["content"][0]["type"] == "text"
    assert "\n    " not in received["messages"][0]["content"][0]["text"]


async def test_optimized_async_wraps_coroutine():
    received = {}

    async def fake_acreate(**kwargs):
        received.update(kwargs)
        return "response"

    create = ts.optimized(fake_acreate)
    payload, _ = doc_payload()
    assert await create(**payload) == "response"
    assert received["messages"][0]["content"][0]["type"] == "text"


# ---- drop-in: wrap() for known SDK shapes ----

class _FakeCompletions:
    def __init__(self):
        self.received = None

    def create(self, **kwargs):
        self.received = kwargs
        return "ok"


class _FakeChat:
    def __init__(self):
        self.completions = _FakeCompletions()


class _FakeOpenAI:
    def __init__(self):
        self.chat = _FakeChat()


class _FakeMessages:
    def __init__(self):
        self.received = None

    def create(self, **kwargs):
        self.received = kwargs
        return "ok"


class _FakeAnthropic:
    def __init__(self):
        self.messages = _FakeMessages()


def test_wrap_openai_shaped_client():
    client = ts.wrap(_FakeOpenAI())
    payload, _ = doc_payload()
    client.chat.completions.create(**payload)
    assert client.chat.completions.received["messages"][0]["content"][0]["type"] == "text"


def test_wrap_anthropic_shaped_client():
    client = ts.wrap(_FakeAnthropic())
    payload, _ = doc_payload(model="claude-sonnet-4-5")
    client.messages.create(**payload)
    assert client.messages.received["messages"][0]["content"][0]["type"] == "text"


def test_wrap_unknown_client_raises():
    with pytest.raises(TypeError):
        ts.wrap(object())


# ---- optimize_file() ----

def test_optimize_file_shrinks_json():
    pretty = json.dumps({"a": list(range(20)), "b": {"c": 1}}, indent=4)
    out = ts.optimize_file(pretty.encode(), "x.json")
    assert out["tokens_after"] < out["tokens_before"]
    assert json.loads(out["text"]) == json.loads(pretty)


def test_savings_accumulate_and_reset():
    ts.optimize(**doc_payload()[0])
    assert ts.savings()["calls"] == 1
    ts.reset_savings()
    assert ts.savings()["tokens_saved"] == 0


def test_optimize_routes_compression_through_the_service():
    # Start the real compression service (rules mode, no model) and confirm the library calls it
    # over HTTP — proven by the SERVER's ledger recording the compression round-trip.
    import socket
    import threading
    import time

    import uvicorn
    from cutok.pillars import webapp

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    app = webapp.app_factory()

    class _FakeModel:  # stand in for the LLMLingua-2 model so the round-trip actually compresses
        def compress(self, text, rate=0.6):
            return {"text": text.split(".")[0]}

    app.state.compressor = _FakeModel()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and not server.started:
            time.sleep(0.05)
        assert server.started
        ts.configure(compress_url=f"http://127.0.0.1:{port}", enable_compression=True)
        ts.optimize(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": "Hi there! I was wondering if you could basically help me out. Thanks in advance!",
                }
            ],
        )
        # The compression service handled it (and compressed) — its own ledger recorded the call.
        assert app.state.ledger.totals()["by_feature"].get("compression", 0) > 0
    finally:
        server.should_exit = True
        thread.join(timeout=10)
