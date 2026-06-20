"""Token counting across every supported provider.

Counting is delegated to the per-provider tokenizer in ``tokenoptim.core.providers``: exact where a
real local tokenizer exists (OpenAI via tiktoken, Mistral via mistral-common, local/Llama via HF
``tokenizers``), and an honest BPE-proxy estimate where the provider ships none (Anthropic,
Gemini, Cohere, DeepSeek, xAI). ``TokenCount.exact`` reflects which path was taken — the engine
never presents an estimate as exact.
"""

from tokenoptim.core.providers import provider_for, resolve, tokenizer_for
from tokenoptim.core.types import Provider, TokenCount

__all__ = ["count_tokens", "provider_for", "estimate_bounds", "Provider"]


def count_tokens(text: str, model: str) -> TokenCount:
    """Count tokens in ``text`` for ``model``. Empty string is always 0 tokens."""
    tokenizer = tokenizer_for(model)
    if not text:
        return TokenCount(count=0, model=model, exact=tokenizer.exact)
    return TokenCount(count=tokenizer.count(text), model=model, exact=tokenizer.exact)


def estimate_bounds(text: str, model: str) -> tuple[int, int, int]:
    """Return (low, point, high) token estimates.

    Exact tokenizers return the same value three times. For a proxy estimate, ``low`` is the raw
    o200k_base BPE count (the estimate divided by that provider's own correction factor) and
    ``high`` applies a worst-case ceiling — so the band reflects the actual per-provider factor,
    not a hardcoded one.
    """
    tok = tokenizer_for(model)
    point = count_tokens(text, model).count
    if tok.exact or point == 0:
        return (point, point, point)
    factor = getattr(tok, "factor", 1.15)
    base = round(point / factor)
    return (base, point, round(base * 1.30))


# Surface the adapter for callers that want full provider metadata (cache policy, usage fields).
def adapter_for(model: str):
    return resolve(model)
