import base64
import json

import pytest

pytest.importorskip("mcp", reason="MCP server requires the optional `mcp` dependency")

from token_optimizer.mcp_server import mcp  # noqa: E402

EXPECTED_TOOLS = {
    "count_tokens",
    "normalize_attachment",
    "optimize_for_cache",
    "compress_prompt",
    "dedupe_context",
}


async def _call(name, args) -> dict:
    res = await mcp.call_tool(name, args)
    if isinstance(res, tuple):  # some SDK versions return (content, structured)
        res = res[1] if res[1] is not None else res[0]
    if isinstance(res, dict):
        return res
    return json.loads(res[0].text)


async def test_list_tools_exposes_five():
    tools = await mcp.list_tools()
    assert {t.name for t in tools} == EXPECTED_TOOLS


async def test_count_tokens_tool():
    out = await _call("count_tokens", {"text": "hello world", "model": "gpt-4o"})
    assert out["count"] > 0
    assert out["exact"] is True


async def test_count_tokens_anthropic_inexact():
    out = await _call("count_tokens", {"text": "hello world", "model": "claude-sonnet-4-5"})
    assert out["exact"] is False


async def test_normalize_attachment_shrinks_json():
    pretty = json.dumps({"a": [1, 2, 3, 4, 5], "b": {"c": 1, "d": 2}}, indent=4)
    b64 = base64.b64encode(pretty.encode()).decode()
    out = await _call(
        "normalize_attachment", {"filename": "x.json", "content_base64": b64, "model": "gpt-4o"}
    )
    assert out["tokens_after"] < out["tokens_before"]
    assert json.loads(out["text"]) == {"a": [1, 2, 3, 4, 5], "b": {"c": 1, "d": 2}}
    assert isinstance(out["changes"], list)


async def test_optimize_for_cache_tool():
    payload = {"model": "claude-sonnet-4-5", "system": "Current time: 2026-06-12T09:30\nBe helpful."}
    out = await _call("optimize_for_cache", {"payload_json": json.dumps(payload)})
    assert "payload_json" in out
    json.loads(out["payload_json"])  # valid JSON round-trips


async def test_dedupe_context_tool():
    shared = (
        "This shared boilerplate paragraph is deliberately long enough in tokens to clear the "
        "deduplication threshold, appearing verbatim across the two separate documents that both "
        "include it word for word without any meaningful variation whatsoever, so the dedup engine "
        "should keep exactly one verbatim copy and replace the other occurrence with a reference."
    )
    out = await _call(
        "dedupe_context",
        {"named_texts": {"a.txt": f"x\n\n{shared}", "b.txt": f"y\n\n{shared}"}, "model": "gpt-4o"},
    )
    combined = out["texts"]["a.txt"] + out["texts"]["b.txt"]
    assert combined.count("shared boilerplate paragraph") == 1
