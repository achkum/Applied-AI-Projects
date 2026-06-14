import json
from pathlib import Path

from token_saver.tokens import count_tokens, provider_for
from token_saver.types import Provider

_VECTORS = json.loads(
    (Path(__file__).resolve().parents[1] / "shared" / "token_test_vectors.json").read_text(
        encoding="utf-8"
    )
)["vectors"]

PANGRAM = "the quick brown fox jumps over the lazy dog"
PANGRAM_O200K = 9  # pinned: len(o200k_base.encode(PANGRAM))


def test_provider_for():
    assert provider_for("gpt-4o") is Provider.OPENAI
    assert provider_for("gpt-3.5-turbo") is Provider.OPENAI
    assert provider_for("o1") is Provider.OPENAI
    assert provider_for("o3-mini") is Provider.OPENAI
    assert provider_for("claude-sonnet-4-5") is Provider.ANTHROPIC
    # Unknown models now default to the OpenAI-compatible family (broadest real-world coverage).
    assert provider_for("something-unknown") is Provider.OPENAI


def test_resolves_every_provider():
    from token_saver.providers import resolve

    cases = {
        "gpt-4o": "openai",
        "claude-opus-4-1": "anthropic",
        "gemini-1.5-pro": "google",
        "mistral-large-latest": "mistral",
        "command-r-plus": "cohere",
        "deepseek-chat": "deepseek",
        "grok-2": "xai",
        "llama-3.1-70b-instruct": "openai-compatible",
        "qwen2.5-coder": "openai-compatible",
    }
    for model, expected in cases.items():
        assert resolve(model).name == expected


def test_exact_where_a_real_local_tokenizer_exists():
    # OpenAI (tiktoken, always installed) is exact; Anthropic/Gemini are always proxy estimates.
    assert count_tokens("hello world", "gpt-4o").exact is True
    assert count_tokens("hello world", "claude-sonnet-4-5").exact is False
    assert count_tokens("hello world", "gemini-1.5-pro").exact is False

    # Mistral is exact only when the optional mistral-common dep is present (proxy otherwise).
    mistral_exact = count_tokens("hello world", "mistral-large-latest").exact
    try:
        import mistral_common  # noqa: F401

        assert mistral_exact is True
    except ImportError:
        assert mistral_exact is False


def test_openai_exact_pinned_count():
    tc = count_tokens(PANGRAM, "gpt-4o")
    assert tc.count == PANGRAM_O200K
    assert tc.exact is True


def test_openai_unknown_model_falls_back_to_o200k():
    tc = count_tokens(PANGRAM, "gpt-future-9000")
    assert tc.count == PANGRAM_O200K
    assert tc.exact is True


def test_anthropic_is_heuristic():
    tc = count_tokens(PANGRAM, "claude-sonnet-4-5")
    assert tc.exact is False
    assert tc.count > 0


def test_empty_string_is_zero():
    assert count_tokens("", "gpt-4o").count == 0
    assert count_tokens("", "claude-sonnet-4-5").count == 0


def test_unicode_does_not_raise():
    for model in ("gpt-4o", "claude-sonnet-4-5"):
        tc = count_tokens("héllo wörld 中文", model)
        assert tc.count > 0


def test_anthropic_heuristic_matches_shared_vectors():
    # These vectors are also asserted in TypeScript (extension/src/__tests__/tokens.test.ts).
    for vector in _VECTORS:
        assert count_tokens(vector["text"], "claude-sonnet-4-5").count == vector["anthropic"]
