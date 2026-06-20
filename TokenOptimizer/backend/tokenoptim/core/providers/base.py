"""Provider adapter abstraction: one object per LLM provider describing everything the engine
needs to optimize that provider's traffic — tokenizer, upstream routing, cache economics, and
where token usage lives in a response.

Schema-shaped optimization (document extraction, system/cache_control rewriting, response-budget
field names) is layered on per provider; this base carries the OpenAI-compatible shape as the
default since most providers (Groq, Together, OpenRouter, DeepSeek, xAI, Ollama, vLLM, …) speak
it. Anthropic and Google override the schema methods.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from tokenoptim.core.providers.tokenizers import Tokenizer


@dataclass(frozen=True)
class CachePolicy:
    """The cache economics of a provider, used to estimate and measure prefix-cache savings."""

    explicit: bool  # provider exposes explicit cache markers (Anthropic cache_control, Gemini)
    discount: float  # fraction of a cached input token's price that is saved (0.9 = 90% off)
    min_prefix_tokens: int  # smallest cacheable prefix for this model
    max_breakpoints: int  # max explicit cache breakpoints (0 if implicit-only)


class ProviderAdapter(ABC):
    name: str
    aliases: tuple[str, ...] = ()
    default_base_url: str = ""
    upstream_env: str = ""
    proxy_paths: tuple[str, ...] = ()
    # Model-name prefixes this adapter owns (lowercased, matched by startswith).
    model_prefixes: tuple[str, ...] = ()
    # Request-schema hooks (so engine modules delegate instead of forking on a 2-value enum):
    # the JSON field that caps output tokens for this provider's request shape.
    max_output_field: str = "max_tokens"

    def matches_model(self, model: str) -> bool:
        m = model.lower()
        return any(m.startswith(p) for p in self.model_prefixes)

    @abstractmethod
    def make_tokenizer(self, model: str) -> Tokenizer:
        """Return a tokenizer for ``model`` (exact where possible, honest proxy otherwise)."""

    # --- cache economics -------------------------------------------------------------------
    def cache_policy(self, model: str) -> CachePolicy:
        # OpenAI-compatible default: automatic prefix caching, ~50% off, no explicit markers.
        return CachePolicy(explicit=False, discount=0.5, min_prefix_tokens=1024, max_breakpoints=0)

    # --- usage extraction (OpenAI-compatible shape by default) -----------------------------
    def usage_input_tokens(self, usage: dict) -> int | None:
        return _as_int(usage.get("prompt_tokens"))

    def usage_output_tokens(self, usage: dict) -> int | None:
        return _as_int(usage.get("completion_tokens"))

    def usage_cache_read_tokens(self, usage: dict) -> int | None:
        details = usage.get("prompt_tokens_details")
        if isinstance(details, dict):
            return _as_int(details.get("cached_tokens"))
        return None


def _as_int(value) -> int | None:
    return value if isinstance(value, int) else None
