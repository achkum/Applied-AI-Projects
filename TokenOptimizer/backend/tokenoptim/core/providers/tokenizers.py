"""Per-provider tokenizers. Real local tokenizers where one exists; an honest BPE-proxy estimate
where the provider publishes none.

Exactness, by provider:
  - OpenAI            tiktoken                     exact
  - Mistral           mistral-common (sentencepiece)  exact (optional dep; proxy fallback)
  - Local / Llama     HF `tokenizers` + tokenizer.json  exact (optional dep; proxy fallback)
  - Anthropic         o200k_base proxy x 1.15      estimate (no public tokenizer)
  - Google Gemini     o200k_base proxy x 1.10      estimate (SentencePiece, not shipped locally)
  - Cohere / DeepSeek / xAI   o200k_base proxy     estimate

Every tokenizer exposes ``exact: bool`` and ``count(text) -> int``. Optional tokenizer libraries
are imported lazily; if missing, the tokenizer degrades to a proxy and flips ``exact`` to False,
so the engine still works on a minimal install and never lies about exactness.
"""

from functools import lru_cache
from typing import Protocol, runtime_checkable

import tiktoken


@runtime_checkable
class Tokenizer(Protocol):
    exact: bool

    def count(self, text: str) -> int: ...


@lru_cache(maxsize=8)
def _encoding(name: str):
    return tiktoken.get_encoding(name)


class TiktokenTokenizer:
    """Exact tokenizer for OpenAI models (and a real BPE base for proxies)."""

    exact = True

    def __init__(self, *, model: str | None = None, encoding: str = "o200k_base") -> None:
        if model is not None:
            try:
                self._enc = tiktoken.encoding_for_model(model)
                return
            except KeyError:
                pass
        self._enc = _encoding(encoding)

    def count(self, text: str) -> int:
        return len(self._enc.encode(text))


class ProxyBPETokenizer:
    """Estimate via a real BPE (o200k_base) scaled by a documented per-provider factor.

    Far better than characters/token: the BPE already captures subword structure, and the factor
    only corrects the small systematic divergence between o200k and the provider's tokenizer.
    """

    exact = False

    def __init__(self, factor: float, *, base_encoding: str = "o200k_base") -> None:
        self.factor = factor
        self._enc = _encoding(base_encoding)

    def count(self, text: str) -> int:
        return round(len(self._enc.encode(text)) * self.factor)


class MistralTokenizer:
    """Exact Mistral tokenizer via mistral-common; proxy fallback if the dep is absent."""

    def __init__(self, fallback_factor: float = 1.10) -> None:
        self._inner = None
        self.exact = True
        try:
            from mistral_common.tokens.tokenizers.mistral import (
                MistralTokenizer as _MT,
            )

            self._inner = _MT.v3().instruct_tokenizer.tokenizer
        except Exception:
            self._fallback = ProxyBPETokenizer(fallback_factor)
            self.exact = False

    def count(self, text: str) -> int:
        if self._inner is None:
            return self._fallback.count(text)
        return len(self._inner.encode(text, bos=False, eos=False))


class HFTokenizer:
    """Exact tokenizer for local / open models via HF `tokenizers` + a tokenizer.json.

    ``source`` is a local tokenizer.json path or a hub repo id. Proxy fallback if the dep is
    absent or the source cannot be loaded (e.g. offline / gated).
    """

    def __init__(self, source: str, fallback_factor: float = 1.10) -> None:
        self._tok = None
        self.exact = True
        try:
            import os

            from tokenizers import Tokenizer as _HF

            self._tok = _HF.from_file(source) if os.path.exists(source) else _HF.from_pretrained(source)
        except Exception:
            self._fallback = ProxyBPETokenizer(fallback_factor)
            self.exact = False

    def count(self, text: str) -> int:
        if self._tok is None:
            return self._fallback.count(text)
        return len(self._tok.encode(text).ids)
