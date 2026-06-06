import asyncio
import base64
import json
from types import SimpleNamespace

from app.agent import loop
from app.schemas import ChatRequest


def collect(async_gen) -> str:
    async def run():
        return [chunk async for chunk in async_gen]

    return "".join(asyncio.run(run()))


def streamed_text(out: str) -> str:
    """Reassemble the token events from an SSE stream into the rendered answer."""
    text = ""
    for line in out.splitlines():
        if line.startswith("data: "):
            event = json.loads(line[len("data: ") :])
            if event.get("type") == "token":
                text += event["text"]
    return text


def test_agent_dispatches_tool_then_answers(monkeypatch, png_bytes):
    # Two canned Gemini turns: first requests a tool, then gives the final answer.
    responses = iter(
        [
            SimpleNamespace(
                function_calls=[SimpleNamespace(name="classify_histopath_image", args={})],
                candidates=[SimpleNamespace(content=SimpleNamespace())],
                text=None,
            ),
            SimpleNamespace(function_calls=None, candidates=[], text="The model predicts benign."),
        ]
    )
    monkeypatch.setattr(loop, "generate", lambda contents, config: next(responses))

    req = ChatRequest(
        session_id="s1",
        message="What does the model think of this slide?",
        image_base64=base64.b64encode(png_bytes).decode(),
    )
    out = collect(loop.run_agent(req))

    assert '"type": "tool"' in out
    assert "classify_histopath_image" in out
    assert "The model predicts benign." in streamed_text(out)
    assert '"type": "done"' in out


def test_agent_without_image_tells_model_to_ask(monkeypatch):
    def fake_generate(contents, config):
        # Second turn (tool result already appended): produce the final answer.
        if len(contents) > 1:
            return SimpleNamespace(
                function_calls=None, candidates=[], text="Please upload a slide."
            )
        return SimpleNamespace(
            function_calls=[SimpleNamespace(name="classify_histopath_image", args={})],
            candidates=[SimpleNamespace(content=SimpleNamespace())],
            text=None,
        )

    monkeypatch.setattr(loop, "generate", fake_generate)
    req = ChatRequest(session_id="s2", message="Classify it", image_base64=None)
    out = collect(loop.run_agent(req))
    assert "Please upload a slide." in streamed_text(out)


def test_agent_reports_missing_key(monkeypatch):
    monkeypatch.setattr(loop.settings, "gemini_api_key", None)
    monkeypatch.setattr(loop, "_client", None)
    req = ChatRequest(session_id="s3", message="hello")
    out = collect(loop.run_agent(req))
    assert '"type": "error"' in out
