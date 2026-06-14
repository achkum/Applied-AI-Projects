"""Request-side controls that shrink the response.

All savings here are realized on the output side and measured later by the proxy (T17), so
``tokens_saved`` is 0 at request time. The pass injects an output cap, an optional brevity
directive (prose only), schema advice (advisory — never renames), and clamps an over-large
thinking budget.
"""

import copy

from token_saver.ledger import Ledger
from token_saver.normalize.textclean import split_fences
from token_saver.providers import resolve
from token_saver.types import Change, OptimizationResult, OptimizerConfig, Provider

_BREVITY = "\n\nBe concise. No preamble, no recap."


def apply_response_budget(
    payload: dict, config: OptimizerConfig, ledger: Ledger
) -> tuple[dict, OptimizationResult]:
    """Apply output-side budget controls to ``payload``; record advisory changes only."""
    payload = copy.deepcopy(payload)
    changes: list[Change] = []

    _inject_max_output(payload, config, changes)
    if config.inject_brevity:
        _inject_brevity(payload, changes)
    _schema_advice(payload, changes)
    _clamp_thinking(payload, config, changes)

    result = OptimizationResult(
        feature="response_budget",
        tokens_before=0,  # realized output savings are computed by the proxy from usage data
        tokens_after=0,
        changes=changes,
    )
    ledger.record(result)
    return payload, result


def _inject_max_output(payload: dict, config: OptimizerConfig, changes: list[Change]) -> None:
    if config.max_output_tokens is None:
        return
    # Only act on the OpenAI/Anthropic message shape; other schemas (e.g. Gemini's `contents` +
    # `generationConfig`) are passed through untouched rather than risk an invalid field.
    if "messages" not in payload:
        return
    # The output-cap field name comes from the provider adapter, not a 2-value enum — so Mistral/
    # DeepSeek/xAI/Cohere correctly get `max_tokens`, OpenAI gets `max_completion_tokens`.
    field = resolve(config.model).max_output_field
    if field in payload:
        return
    payload[field] = config.max_output_tokens
    changes.append(
        Change(
            kind="max_output_tokens",
            description=f"set {field}={config.max_output_tokens}",
            tokens_saved=0,
        )
    )


def _inject_brevity(payload: dict, changes: list[Change]) -> None:
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return
    msg = next((m for m in reversed(messages) if isinstance(m, dict) and m.get("role") == "user"), None)
    if msg is None:
        return
    content = msg.get("content")

    if isinstance(content, str):
        if _BREVITY.strip() in content or _is_mostly_code(content):
            return
        msg["content"] = content + _BREVITY
    elif isinstance(content, list):
        text_blocks = [b for b in content if isinstance(b, dict) and b.get("type") == "text"]
        if not text_blocks:
            return
        joined = "\n".join(b.get("text", "") for b in text_blocks)
        if _BREVITY.strip() in joined or _is_mostly_code(joined):
            return
        text_blocks[-1]["text"] = text_blocks[-1].get("text", "") + _BREVITY
    else:
        return

    changes.append(
        Change(kind="brevity_directive", description="appended a concise-output directive", tokens_saved=0)
    )


def _is_mostly_code(text: str) -> bool:
    parts = split_fences(text)
    code_len = sum(len(seg) for is_code, seg in parts if is_code)
    return code_len > 0.5 * max(1, len(text))


def _schema_advice(payload: dict, changes: list[Change]) -> None:
    long_names: set[str] = set()
    _collect_long_property_names(payload.get("tools"), long_names)
    _collect_long_property_names(payload.get("response_format"), long_names)
    if long_names:
        changes.append(
            Change(
                kind="schema_advice",
                description=f"{len(long_names)} schema property name(s) >=20 chars; "
                "shorter names would cut tokens (not renamed — would break the contract)",
                tokens_saved=0,
            )
        )


def _collect_long_property_names(node, out: set[str]) -> None:
    if isinstance(node, dict):
        props = node.get("properties")
        if isinstance(props, dict):
            for key in props:
                if isinstance(key, str) and len(key) >= 20:
                    out.add(key)
        for value in node.values():
            _collect_long_property_names(value, out)
    elif isinstance(node, list):
        for item in node:
            _collect_long_property_names(item, out)


def _clamp_thinking(payload: dict, config: OptimizerConfig, changes: list[Change]) -> None:
    # Cap is off by default; a caller may set `config.max_thinking_tokens` to enable it.
    cap = getattr(config, "max_thinking_tokens", None)
    if cap is None or config.provider is not Provider.ANTHROPIC:
        return
    thinking = payload.get("thinking")
    if not isinstance(thinking, dict):
        return
    budget = thinking.get("budget_tokens")
    if isinstance(budget, int) and budget > cap:
        thinking["budget_tokens"] = cap
        changes.append(
            Change(
                kind="clamp_thinking",
                description=f"clamped thinking budget {budget} -> {cap}",
                tokens_saved=0,
            )
        )
