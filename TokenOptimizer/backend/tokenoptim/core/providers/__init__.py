"""Provider registry: resolve a model name (or request path) to its adapter.

Order matters — more specific adapters are checked before the OpenAI-compatible catch-all.
"""

from functools import lru_cache

from tokenoptim.core.providers.adapters import (
    AnthropicAdapter,
    CohereAdapter,
    DeepSeekAdapter,
    GoogleAdapter,
    MistralAdapter,
    OpenAIAdapter,
    OpenAICompatibleAdapter,
    XAIAdapter,
)
from tokenoptim.core.providers.base import ProviderAdapter
from tokenoptim.core.providers.tokenizers import Tokenizer
from tokenoptim.core.types import Provider

# Specific adapters first; OpenAI-compatible is the catch-all and must be last.
ADAPTERS: list[ProviderAdapter] = [
    OpenAIAdapter(),
    AnthropicAdapter(),
    GoogleAdapter(),
    MistralAdapter(),
    CohereAdapter(),
    DeepSeekAdapter(),
    XAIAdapter(),
    OpenAICompatibleAdapter(),
]

_BY_NAME = {a.name: a for a in ADAPTERS}
# The fallback when no adapter claims a model: OpenAI-compatible (broadest real-world coverage).
_DEFAULT = _BY_NAME["openai-compatible"]


def resolve(model: str) -> ProviderAdapter:
    """Return the adapter that owns ``model``, or the OpenAI-compatible catch-all."""
    for adapter in ADAPTERS:
        if adapter is _DEFAULT:
            continue
        if adapter.matches_model(model):
            return adapter
    return _DEFAULT


def resolve_by_path(path: str) -> ProviderAdapter | None:
    """Return the adapter serving a request ``path`` (used by the proxy for routing)."""
    for adapter in ADAPTERS:
        if any(path.startswith(p) for p in adapter.proxy_paths):
            return adapter
    return None


def adapter_by_name(name: str) -> ProviderAdapter | None:
    return _BY_NAME.get(name)


@lru_cache(maxsize=64)
def tokenizer_for(model: str) -> Tokenizer:
    return resolve(model).make_tokenizer(model)


# Back-compat: the original two-value Provider enum (request-schema family). Anthropic has its
# own schema; every other provider is handled OpenAI-compatibly by the legacy engine modules
# until they are rewired to the adapter's own schema hooks.
def provider_for(model: str) -> Provider:
    return Provider.ANTHROPIC if resolve(model).name == "anthropic" else Provider.OPENAI
