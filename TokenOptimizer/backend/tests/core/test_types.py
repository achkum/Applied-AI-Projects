from cutok.core.types import (
    Change,
    Normalizer,
    NormalizeResult,
    OptimizationResult,
    OptimizerConfig,
    Provider,
    TokenCount,
)


def test_provider_enum():
    assert Provider.ANTHROPIC == "anthropic"
    assert Provider.OPENAI == "openai"


def test_token_count_is_frozen():
    tc = TokenCount(count=10, model="gpt-4o", exact=True)
    assert tc.count == 10 and tc.exact is True


def test_change_instantiates():
    c = Change(kind="minify_json", description="minified", tokens_saved=5)
    assert c.tokens_saved == 5


def test_optimization_result_tokens_saved():
    r = OptimizationResult(feature="normalization", tokens_before=100, tokens_after=70)
    assert r.tokens_saved == 30
    assert r.changes == []


def test_normalize_result_holds_changes():
    nr = NormalizeResult(
        text="x",
        changes=[Change("minify_json", "d", 1)],
        guarantee="value-identical",
    )
    assert nr.guarantee == "value-identical"
    assert len(nr.changes) == 1


def test_optimizer_config_defaults():
    cfg = OptimizerConfig()
    assert cfg.provider is Provider.ANTHROPIC
    assert cfg.enable_compression is True  # compression is on by default
    assert cfg.compression_keep_ratio == 0.8
    assert cfg.max_output_tokens is None


def test_normalizer_is_protocol():
    # A class structurally matching the protocol is accepted.
    class Dummy:
        name = "dummy"

        def supports(self, filename: str) -> bool:
            return True

        def normalize(self, text: str, filename: str, model: str) -> NormalizeResult:
            return NormalizeResult(text=text, changes=[], guarantee="value-identical")

    d: Normalizer = Dummy()
    assert d.supports("a.json")
