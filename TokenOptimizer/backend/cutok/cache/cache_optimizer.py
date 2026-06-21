"""Rewrite a messages payload for maximum prefix-cache hits.

Nothing is removed, so ``tokens_after == tokens_before``; cache savings are ESTIMATED
(0.9 x the tokens placed under ``cache_control``) and reported in a Change description, since
the real saving is realized only at request time by the provider. The pass is idempotent:
running it twice changes nothing.
"""

import copy
import re

from cutok.core.ledger import Ledger
from cutok.core.tokens import count_tokens
from cutok.core.types import Change, OptimizationResult, OptimizerConfig, Provider

_STABLE_CACHE_MIN_TOKENS = 1024
_DOC_CACHE_MIN_TOKENS = 2000
_MAX_CACHE_CONTROL_BLOCKS = 4
_CACHE_DISCOUNT = 0.9

_VOLATILE_PATTERNS = [
    re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}"),  # ISO timestamp
    re.compile(r"\b\d{1,2}:\d{2}(:\d{2})?\b"),  # clock time
    re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"),
    re.compile(r"today is\b", re.IGNORECASE),
]


def optimize_for_cache(
    payload: dict, config: OptimizerConfig, ledger: Ledger
) -> tuple[dict, OptimizationResult]:
    """Reorder for prefix stability and inject cache_control markers where thresholds are met."""
    payload = copy.deepcopy(payload)
    changes: list[Change] = []
    model = config.model

    if config.provider is Provider.ANTHROPIC:
        _optimize_anthropic_system(payload, model, changes)
        _optimize_anthropic_document(payload, model, changes)
    else:
        _optimize_openai_system(payload, changes)

    tokens = _payload_token_estimate(payload, model)
    result = OptimizationResult(
        feature="cache_optimization",
        tokens_before=tokens,
        tokens_after=tokens,  # nothing removed; cache savings are estimated, not realized here
        changes=changes,
    )
    ledger.record(result)
    return payload, result


def _is_volatile(line: str) -> bool:
    return any(p.search(line) for p in _VOLATILE_PATTERNS)


def _partition(lines: list[str]) -> tuple[list[str], list[str]]:
    stable = [ln for ln in lines if not _is_volatile(ln)]
    volatile = [ln for ln in lines if _is_volatile(ln)]
    return stable, volatile


def _system_lines_and_cc(system) -> tuple[list[str], bool]:
    if isinstance(system, str):
        return system.split("\n"), False
    if isinstance(system, list):
        texts, has_cc = [], False
        for block in system:
            if isinstance(block, dict):
                texts.append(block.get("text", ""))
                if block.get("cache_control"):
                    has_cc = True
        return "\n".join(texts).split("\n"), has_cc
    return [], False


def _optimize_anthropic_system(payload: dict, model: str, changes: list[Change]) -> None:
    system = payload.get("system")
    if system is None:
        return
    lines, already_cc = _system_lines_and_cc(system)
    stable, volatile = _partition(lines)

    if volatile and (stable + volatile) != lines:
        changes.append(
            Change(
                kind="hoist_volatile",
                description=f"moved {len(volatile)} volatile line(s) out of the cacheable prefix",
                tokens_saved=0,
            )
        )

    stable_text = "\n".join(stable)
    volatile_text = "\n".join(volatile)
    stable_tokens = count_tokens(stable_text, model).count
    use_blocks = stable_tokens >= _STABLE_CACHE_MIN_TOKENS or already_cc

    if use_blocks:
        new_system: list = [
            {"type": "text", "text": stable_text, "cache_control": {"type": "ephemeral"}}
        ]
        if volatile_text:
            new_system.append({"type": "text", "text": volatile_text})
        if not already_cc and _count_cache_control(payload) < _MAX_CACHE_CONTROL_BLOCKS:
            saved = round(_CACHE_DISCOUNT * stable_tokens)
            changes.append(
                Change(
                    kind="cache_control_system",
                    description=f"marked {stable_tokens}-token system prefix cacheable "
                    f"(est. {saved} tokens/call saved)",
                    tokens_saved=0,
                )
            )
        elif not already_cc:
            # Would exceed the 4-block cap — leave the prefix as plain blocks, no cache_control.
            new_system = [{"type": "text", "text": stable_text}]
            if volatile_text:
                new_system.append({"type": "text", "text": volatile_text})
        payload["system"] = new_system
    else:
        payload["system"] = (
            stable_text if not volatile_text else f"{stable_text}\n{volatile_text}"
        )


def _optimize_anthropic_document(payload: dict, model: str, changes: list[Change]) -> None:
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return
    first_user = next((m for m in messages if isinstance(m, dict) and m.get("role") == "user"), None)
    if first_user is None:
        return
    content = first_user.get("content")
    if not isinstance(content, list):
        return

    text_blocks = [
        (i, b) for i, b in enumerate(content) if isinstance(b, dict) and b.get("type") == "text"
    ]
    for pos, (idx, block) in enumerate(text_blocks):
        if block.get("cache_control"):
            continue
        doc_tokens = count_tokens(block.get("text", ""), model).count
        has_following_short = pos + 1 < len(text_blocks) and (
            count_tokens(text_blocks[pos + 1][1].get("text", ""), model).count < doc_tokens
        )
        if doc_tokens >= _DOC_CACHE_MIN_TOKENS and has_following_short:
            if _count_cache_control(payload) >= _MAX_CACHE_CONTROL_BLOCKS:
                break
            block["cache_control"] = {"type": "ephemeral"}
            saved = round(_CACHE_DISCOUNT * doc_tokens)
            changes.append(
                Change(
                    kind="cache_control_document",
                    description=f"marked {doc_tokens}-token document cacheable "
                    f"(est. {saved} tokens/call saved)",
                    tokens_saved=0,
                )
            )
            break


def _optimize_openai_system(payload: dict, changes: list[Change]) -> None:
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return
    for msg in messages:
        if isinstance(msg, dict) and msg.get("role") == "system" and isinstance(msg.get("content"), str):
            lines = msg["content"].split("\n")
            stable, volatile = _partition(lines)
            if volatile and (stable + volatile) != lines:
                msg["content"] = "\n".join(stable + volatile)
                changes.append(
                    Change(
                        kind="hoist_volatile",
                        description=f"moved {len(volatile)} volatile line(s) to the system suffix",
                        tokens_saved=0,
                    )
                )
            return


def _count_cache_control(payload: dict) -> int:
    n = 0
    system = payload.get("system")
    if isinstance(system, list):
        n += sum(1 for b in system if isinstance(b, dict) and b.get("cache_control"))
    for msg in payload.get("messages", []):
        content = msg.get("content") if isinstance(msg, dict) else None
        if isinstance(content, list):
            n += sum(1 for b in content if isinstance(b, dict) and b.get("cache_control"))
    return n


def _payload_token_estimate(payload: dict, model: str) -> int:
    lines, _ = _system_lines_and_cc(payload.get("system"))
    total = count_tokens("\n".join(lines), model).count
    for msg in payload.get("messages", []):
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if isinstance(content, str):
            total += count_tokens(content, model).count
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and isinstance(block.get("text"), str):
                    total += count_tokens(block["text"], model).count
    return total
