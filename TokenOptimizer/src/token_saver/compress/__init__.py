"""Local prompt compression: a deterministic rule pass and an optional ONNX classifier pass."""

import copy

from token_saver.ledger import Ledger
from token_saver.types import Change, OptimizationResult, OptimizerConfig


def compress_payload(
    payload: dict, config: OptimizerConfig, ledger: Ledger
) -> tuple[dict, OptimizationResult]:
    """Compress prose in every user message (rule pass always, classifier when enabled+ready)."""
    from token_saver.optimizer import compress_text

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
