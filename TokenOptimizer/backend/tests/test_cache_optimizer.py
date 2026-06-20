from app.cache.cache_optimizer import optimize_for_cache
from app.core.ledger import Ledger
from app.core.types import OptimizerConfig, Provider

ANTHROPIC = OptimizerConfig(model="claude-sonnet-4-5", provider=Provider.ANTHROPIC)
OPENAI = OptimizerConfig(model="gpt-4o", provider=Provider.OPENAI)

BIG_STABLE = " ".join(["lorem"] * 1300)  # comfortably over 1024 tokens
VOLATILE_LINE = "Current time: 2026-06-12T09:30 session 12:00:00"


def test_volatile_line_moves_to_suffix():
    payload = {"system": f"{VOLATILE_LINE}\nYou are a helpful assistant.\nFollow the rules."}
    out, result = optimize_for_cache(payload, ANTHROPIC, Ledger())
    system = out["system"]
    # Small system stays a string; the volatile line is now at the end.
    assert isinstance(system, str)
    assert system.endswith(VOLATILE_LINE)
    assert not system.startswith(VOLATILE_LINE)
    assert any(c.kind == "hoist_volatile" for c in result.changes)


def test_cache_control_added_when_stable_prefix_large():
    payload = {"system": f"{BIG_STABLE}\n{VOLATILE_LINE}"}
    out, result = optimize_for_cache(payload, ANTHROPIC, Ledger())
    system = out["system"]
    assert isinstance(system, list)
    assert system[0]["cache_control"] == {"type": "ephemeral"}
    assert "lorem" in system[0]["text"]
    # Volatile content in a trailing, non-cached block.
    assert VOLATILE_LINE in system[-1]["text"]
    assert "cache_control" not in system[-1]
    assert any(c.kind == "cache_control_system" for c in result.changes)


def test_no_cache_control_when_small():
    payload = {"system": "You are helpful.\nBe concise."}
    out, _ = optimize_for_cache(payload, ANTHROPIC, Ledger())
    assert isinstance(out["system"], str)


def test_document_block_gets_cache_control():
    doc = " ".join(["data"] * 2500)
    payload = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": doc},
                    {"type": "text", "text": "What is the summary?"},
                ],
            }
        ]
    }
    out, result = optimize_for_cache(payload, ANTHROPIC, Ledger())
    blocks = out["messages"][0]["content"]
    assert blocks[0]["cache_control"] == {"type": "ephemeral"}
    assert "cache_control" not in blocks[1]
    assert any(c.kind == "cache_control_document" for c in result.changes)


def test_never_exceeds_four_cache_control_blocks():
    payload = {
        "system": f"{BIG_STABLE}\n{VOLATILE_LINE}",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"x{i}", "cache_control": {"type": "ephemeral"}}
                    for i in range(4)
                ],
            }
        ],
    }
    out, _ = optimize_for_cache(payload, ANTHROPIC, Ledger())
    n = sum(1 for b in out["system"] if isinstance(b, dict) and b.get("cache_control"))
    n += sum(1 for b in out["messages"][0]["content"] if b.get("cache_control"))
    assert n <= 4


def test_no_system_does_not_crash():
    payload = {"messages": [{"role": "user", "content": "hi"}]}
    out, result = optimize_for_cache(payload, ANTHROPIC, Ledger())
    assert out["messages"][0]["content"] == "hi"
    assert result.feature == "cache_optimization"


def test_tokens_before_equals_after():
    payload = {"system": f"{BIG_STABLE}\n{VOLATILE_LINE}"}
    _, result = optimize_for_cache(payload, ANTHROPIC, Ledger())
    assert result.tokens_before == result.tokens_after


def test_idempotent():
    payload = {
        "system": f"{BIG_STABLE}\n{VOLATILE_LINE}",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": " ".join(["data"] * 2500)},
                    {"type": "text", "text": "summary?"},
                ],
            }
        ],
    }
    once, _ = optimize_for_cache(payload, ANTHROPIC, Ledger())
    twice, result2 = optimize_for_cache(once, ANTHROPIC, Ledger())
    assert once == twice
    assert result2.changes == []


def test_openai_hoists_volatile_only():
    payload = {
        "messages": [
            {"role": "system", "content": f"{VOLATILE_LINE}\nYou are helpful.\nBe terse."},
            {"role": "user", "content": "hi"},
        ]
    }
    out, result = optimize_for_cache(payload, OPENAI, Ledger())
    assert out["messages"][0]["content"].endswith(VOLATILE_LINE)
    assert any(c.kind == "hoist_volatile" for c in result.changes)
