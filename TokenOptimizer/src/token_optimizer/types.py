"""Shared vocabulary for the whole engine. Import from here; never redefine these."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol


class Provider(str, Enum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"


@dataclass(frozen=True)
class TokenCount:
    count: int
    model: str
    exact: bool  # False when heuristic (Anthropic local estimate)


@dataclass
class Change:
    kind: str  # e.g. "minify_json", "strip_header", "dedup_chunk"
    description: str  # human-readable, one line
    tokens_saved: int


@dataclass
class OptimizationResult:
    feature: str  # "normalization" | "cache_optimization" | "compression" | "response_budget"
    tokens_before: int
    tokens_after: int
    changes: list[Change] = field(default_factory=list)

    @property
    def tokens_saved(self) -> int:
        return self.tokens_before - self.tokens_after


@dataclass
class NormalizeResult:
    text: str
    changes: list[Change]
    guarantee: str  # "value-identical" | "text-lossless" | "render-equivalent" | "ast-identical"


class Normalizer(Protocol):
    name: str

    def supports(self, filename: str) -> bool: ...

    def normalize(self, text: str, filename: str, model: str) -> NormalizeResult: ...


@dataclass
class OptimizerConfig:
    model: str = "claude-sonnet-4-5"
    provider: Provider = Provider.ANTHROPIC
    enable_compression: bool = False  # prompt compression is opt-in
    compression_keep_ratio: float = 0.7  # classifier keep-ratio
    inject_brevity: bool = False  # response-budget directive is opt-in
    max_output_tokens: int | None = None
