"""Prompt compression via the shared LLMLingua-2 model (the Cloud Run service)."""

import copy

from app.core.ledger import Ledger
from app.core.types import Change, OptimizationResult, OptimizerConfig


def compress_payload(
    payload: dict, config: OptimizerConfig, ledger: Ledger
) -> tuple[dict, OptimizationResult]:
    """Compress prose in every user message through the shared model (no-op if it's unavailable)."""
    from app.optimizer import compress_text

    payload = copy.deepcopy(payload)
    changes: list[Change] = []
    before = 0
    after = 0

    for msg in payload.get("messages", []):
        if not isinstance(msg, dict) or msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str):
            new, res = compress_text(content, config)
            msg["content"] = new
            before += res.tokens_before
            after += res.tokens_after
            changes += res.changes
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and isinstance(block.get("text"), str):
                    new, res = compress_text(block["text"], config)
                    block["text"] = new
                    before += res.tokens_before
                    after += res.tokens_after
                    changes += res.changes

    result = OptimizationResult(
        feature="compression", tokens_before=before, tokens_after=after, changes=changes
    )
    ledger.record(result)
    return payload, result
