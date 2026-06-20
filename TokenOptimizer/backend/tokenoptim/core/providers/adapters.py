"""Concrete provider adapters. Tokenizers are exact where a local one exists, honest proxies
otherwise; proxy factors are documented estimates of each provider's divergence from o200k_base.
"""

from tokenoptim.core.providers.base import CachePolicy, ProviderAdapter
from tokenoptim.core.providers.tokenizers import (
    HFTokenizer,
    MistralTokenizer,
    ProxyBPETokenizer,
    TiktokenTokenizer,
    Tokenizer,
)


class OpenAIAdapter(ProviderAdapter):
    name = "openai"
    default_base_url = "https://api.openai.com"
    upstream_env = "TS_OPENAI_UPSTREAM"
    proxy_paths = ("/v1/chat/completions", "/v1/responses", "/v1/completions")
    model_prefixes = ("gpt", "o1", "o3", "o4", "chatgpt", "text-")
    max_output_field = "max_completion_tokens"  # OpenAI chat-completions

    def make_tokenizer(self, model: str) -> Tokenizer:
        return TiktokenTokenizer(model=model)

    def cache_policy(self, model: str) -> CachePolicy:
        return CachePolicy(explicit=False, discount=0.5, min_prefix_tokens=1024, max_breakpoints=0)


class AnthropicAdapter(ProviderAdapter):
    name = "anthropic"
    default_base_url = "https://api.anthropic.com"
    upstream_env = "TS_ANTHROPIC_UPSTREAM"
    proxy_paths = ("/v1/messages",)
    model_prefixes = ("claude",)

    def make_tokenizer(self, model: str) -> Tokenizer:
        # No public local tokenizer; o200k_base proxy with an empirical Claude correction.
        return ProxyBPETokenizer(1.15)

    def cache_policy(self, model: str) -> CachePolicy:
        # Cache reads cost ~10% of input (90% off); min prefix 1024, 2048 for Haiku; ≤4 breakpoints.
        min_prefix = 2048 if "haiku" in model.lower() else 1024
        return CachePolicy(explicit=True, discount=0.9, min_prefix_tokens=min_prefix, max_breakpoints=4)

    def usage_input_tokens(self, usage: dict) -> int | None:
        return _int(usage.get("input_tokens"))

    def usage_output_tokens(self, usage: dict) -> int | None:
        return _int(usage.get("output_tokens"))

    def usage_cache_read_tokens(self, usage: dict) -> int | None:
        return _int(usage.get("cache_read_input_tokens"))


class GoogleAdapter(ProviderAdapter):
    name = "google"
    default_base_url = "https://generativelanguage.googleapis.com"
    upstream_env = "TS_GOOGLE_UPSTREAM"
    proxy_paths = ("/v1beta/models", "/v1/models")
    model_prefixes = ("gemini", "models/gemini", "learnlm")
    max_output_field = "maxOutputTokens"  # nested under generationConfig (Gemini's own schema)

    def make_tokenizer(self, model: str) -> Tokenizer:
        # Gemini uses SentencePiece (not shipped locally); o200k proxy, slightly more efficient.
        return ProxyBPETokenizer(1.10)

    def cache_policy(self, model: str) -> CachePolicy:
        # Gemini context caching bills cached tokens at ~25% (75% off); large min prefix.
        return CachePolicy(explicit=True, discount=0.75, min_prefix_tokens=4096, max_breakpoints=1)

    def usage_input_tokens(self, usage: dict) -> int | None:
        return _int(usage.get("promptTokenCount"))

    def usage_output_tokens(self, usage: dict) -> int | None:
        return _int(usage.get("candidatesTokenCount"))

    def usage_cache_read_tokens(self, usage: dict) -> int | None:
        return _int(usage.get("cachedContentTokenCount"))


class MistralAdapter(ProviderAdapter):
    name = "mistral"
    default_base_url = "https://api.mistral.ai"
    upstream_env = "TS_MISTRAL_UPSTREAM"
    proxy_paths = ("/v1/chat/completions",)
    model_prefixes = ("mistral", "mixtral", "ministral", "codestral", "pixtral", "magistral", "devstral", "open-mistral", "open-mixtral")

    def make_tokenizer(self, model: str) -> Tokenizer:
        return MistralTokenizer()  # exact via mistral-common, proxy fallback


class CohereAdapter(ProviderAdapter):
    name = "cohere"
    default_base_url = "https://api.cohere.com"
    upstream_env = "TS_COHERE_UPSTREAM"
    proxy_paths = ("/v2/chat", "/v1/chat")
    model_prefixes = ("command", "cohere", "c4ai")

    def make_tokenizer(self, model: str) -> Tokenizer:
        return ProxyBPETokenizer(1.15)

    def usage_input_tokens(self, usage: dict) -> int | None:
        tokens = usage.get("tokens") or usage.get("billed_units")
        if isinstance(tokens, dict):
            return _int(tokens.get("input_tokens"))
        return None

    def usage_output_tokens(self, usage: dict) -> int | None:
        tokens = usage.get("tokens") or usage.get("billed_units")
        if isinstance(tokens, dict):
            return _int(tokens.get("output_tokens"))
        return None


class DeepSeekAdapter(ProviderAdapter):
    name = "deepseek"
    default_base_url = "https://api.deepseek.com"
    upstream_env = "TS_DEEPSEEK_UPSTREAM"
    proxy_paths = ("/v1/chat/completions", "/chat/completions")
    model_prefixes = ("deepseek",)

    def make_tokenizer(self, model: str) -> Tokenizer:
        return ProxyBPETokenizer(1.10)

    def usage_cache_read_tokens(self, usage: dict) -> int | None:
        # DeepSeek reports its own context-cache hit field.
        return _int(usage.get("prompt_cache_hit_tokens"))


class XAIAdapter(ProviderAdapter):
    name = "xai"
    default_base_url = "https://api.x.ai"
    upstream_env = "TS_XAI_UPSTREAM"
    proxy_paths = ("/v1/chat/completions",)
    model_prefixes = ("grok",)

    def make_tokenizer(self, model: str) -> Tokenizer:
        return ProxyBPETokenizer(1.10)


class OpenAICompatibleAdapter(ProviderAdapter):
    """Catch-all for OpenAI-API-compatible endpoints: Groq, Together, OpenRouter, Fireworks,
    Perplexity, Ollama, vLLM, LM Studio, and other local servers. Tokenizer is the local HF
    tokenizer when ``TS_LOCAL_TOKENIZER`` points at a tokenizer.json, else an o200k proxy.
    """

    name = "openai-compatible"
    default_base_url = "http://localhost:11434"  # Ollama default; override via env
    upstream_env = "TS_OPENAI_COMPATIBLE_UPSTREAM"
    proxy_paths = ("/v1/chat/completions",)
    model_prefixes = ("llama", "meta-llama", "qwen", "gemma", "phi", "yi")

    def __init__(self, local_tokenizer_source: str | None = None) -> None:
        self._source = local_tokenizer_source

    def make_tokenizer(self, model: str) -> Tokenizer:
        if self._source:
            return HFTokenizer(self._source)
        return ProxyBPETokenizer(1.10)

    def cache_policy(self, model: str) -> CachePolicy:
        return CachePolicy(explicit=False, discount=0.0, min_prefix_tokens=0, max_breakpoints=0)


def _int(value) -> int | None:
    return value if isinstance(value, int) else None
