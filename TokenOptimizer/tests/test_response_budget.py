from token_optimizer.ledger import Ledger
from token_optimizer.response_budget import apply_response_budget
from token_optimizer.types import OptimizerConfig, Provider


def cfg(**kw):
    base = dict(model="claude-sonnet-4-5", provider=Provider.ANTHROPIC)
    base.update(kw)
    return OptimizerConfig(**base)


def test_injects_max_tokens_anthropic():
    payload = {"messages": [{"role": "user", "content": "hi"}]}
    out, _ = apply_response_budget(payload, cfg(max_output_tokens=512), Ledger())
    assert out["max_tokens"] == 512


def test_injects_max_completion_tokens_openai():
    payload = {"messages": [{"role": "user", "content": "hi"}]}
    conf = OptimizerConfig(model="gpt-4o", provider=Provider.OPENAI, max_output_tokens=256)
    out, _ = apply_response_budget(payload, conf, Ledger())
    assert out["max_completion_tokens"] == 256
    assert "max_tokens" not in out


def test_output_field_is_provider_correct():
    # The cap field name comes from the provider adapter, not a 2-value enum.
    payload_mistral = {"messages": [{"role": "user", "content": "hi"}]}
    out = apply_response_budget(
        payload_mistral,
        OptimizerConfig(model="mistral-large-latest", provider=Provider.OPENAI, max_output_tokens=64),
        Ledger(),
    )[0]
    assert out["max_tokens"] == 64  # Mistral/DeepSeek/xAI use max_tokens, NOT max_completion_tokens
    assert "max_completion_tokens" not in out

    out_deepseek = apply_response_budget(
        {"messages": [{"role": "user", "content": "hi"}]},
        OptimizerConfig(model="deepseek-chat", provider=Provider.OPENAI, max_output_tokens=64),
        Ledger(),
    )[0]
    assert out_deepseek["max_tokens"] == 64

    out_openai = apply_response_budget(
        {"messages": [{"role": "user", "content": "hi"}]},
        OptimizerConfig(model="gpt-4o", provider=Provider.OPENAI, max_output_tokens=64),
        Ledger(),
    )[0]
    assert out_openai["max_completion_tokens"] == 64


def test_max_tokens_not_overwritten():
    payload = {"messages": [{"role": "user", "content": "hi"}], "max_tokens": 99}
    out, _ = apply_response_budget(payload, cfg(max_output_tokens=512), Ledger())
    assert out["max_tokens"] == 99


def test_brevity_injection_idempotent():
    payload = {"messages": [{"role": "user", "content": "Explain quantum tunneling in depth."}]}
    out1, r1 = apply_response_budget(payload, cfg(inject_brevity=True), Ledger())
    assert out1["messages"][0]["content"].endswith("Be concise. No preamble, no recap.")
    assert any(c.kind == "brevity_directive" for c in r1.changes)
    out2, r2 = apply_response_budget(out1, cfg(inject_brevity=True), Ledger())
    assert out2["messages"][0]["content"] == out1["messages"][0]["content"]
    assert not any(c.kind == "brevity_directive" for c in r2.changes)


def test_brevity_skipped_for_code_heavy_message():
    code = "```python\n" + "\n".join(f"x{i} = {i}" for i in range(40)) + "\n```"
    payload = {"messages": [{"role": "user", "content": code}]}
    out, _ = apply_response_budget(payload, cfg(inject_brevity=True), Ledger())
    assert "Be concise" not in out["messages"][0]["content"]


def test_schema_advice_emitted_not_renamed():
    payload = {
        "messages": [{"role": "user", "content": "hi"}],
        "tools": [
            {
                "name": "t",
                "input_schema": {
                    "type": "object",
                    "properties": {"this_is_a_really_long_property_name": {"type": "string"}},
                },
            }
        ],
    }
    out, result = apply_response_budget(payload, cfg(), Ledger())
    assert any(c.kind == "schema_advice" for c in result.changes)
    # Not renamed.
    assert "this_is_a_really_long_property_name" in out["tools"][0]["input_schema"]["properties"]


def test_clamp_thinking_when_cap_set():
    conf = cfg()
    conf.max_thinking_tokens = 1000
    payload = {
        "messages": [{"role": "user", "content": "hi"}],
        "thinking": {"type": "enabled", "budget_tokens": 8000},
    }
    out, result = apply_response_budget(payload, conf, Ledger())
    assert out["thinking"]["budget_tokens"] == 1000
    assert any(c.kind == "clamp_thinking" for c in result.changes)


def test_feature_name_and_zero_request_savings():
    payload = {"messages": [{"role": "user", "content": "hi"}]}
    _, result = apply_response_budget(payload, cfg(max_output_tokens=10), Ledger())
    assert result.feature == "response_budget"
    assert result.tokens_saved == 0
