"""In-memory, thread-safe session counter — the product's one metric.

No persistence here; the proxy adds JSON-lines logging in T17.
"""

import threading

from app.core.types import OptimizationResult


class Ledger:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tokens_saved = 0
        self._tokens_processed = 0
        self._by_feature: dict[str, int] = {}
        self._calls = 0

    def record(self, result: OptimizationResult) -> None:
        """Fold one optimization result into the running totals."""
        with self._lock:
            self._record_locked(result)

    def record_call(self, results: list[OptimizationResult]) -> None:
        """Record every result for one LLM call and increment the call count once."""
        with self._lock:
            for result in results:
                self._record_locked(result)
            self._calls += 1

    def _record_locked(self, result: OptimizationResult) -> None:
        self._tokens_saved += result.tokens_saved
        self._tokens_processed += result.tokens_before
        self._by_feature[result.feature] = (
            self._by_feature.get(result.feature, 0) + result.tokens_saved
        )

    def totals(self) -> dict:
        with self._lock:
            return {
                "tokens_saved": self._tokens_saved,
                "tokens_processed": self._tokens_processed,
                "by_feature": dict(self._by_feature),
                "calls": self._calls,
            }

    def reset(self) -> None:
        with self._lock:
            self._tokens_saved = 0
            self._tokens_processed = 0
            self._by_feature = {}
            self._calls = 0
