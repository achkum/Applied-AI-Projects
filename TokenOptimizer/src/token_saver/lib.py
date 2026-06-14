"""Importable library — add one optimization layer on top of your existing LLM/agent calls.

Provider-agnostic: it transforms the *request payload* (messages/system/attachments/cache/output
budget) before the call, so it works with any SDK whose request looks like OpenAI- or
Anthropic-shaped chat. Three ways to use it:

    import token_saver as ts

    # 1) functional — optimize a request, then send it however you like
    req = ts.optimize(model="gpt-4o", messages=[...])
    resp = openai.OpenAI().chat.completions.create(**req)

    # 2) universal — wrap ANY create-callable (sync or async), any provider/SDK
    create = ts.optimized(openai.OpenAI().chat.completions.create)
    resp = create(model="gpt-4o", messages=[...])

    create = ts.optimized(anthropic.Anthropic().messages.create)
    resp = create(model="claude-sonnet-4-5", system="...", messages=[...])

    # 3) drop-in — wrap a known client; every call is optimized
    client = ts.wrap(openai.OpenAI())
    client.chat.completions.create(model="gpt-4o", messages=[...])

Optimization is lossless by default; call ``ts.configure(enable_compression=True)`` to also run
lossy prompt compression. ``ts.savings()`` returns the cumulative tokens saved.
"""

import asyncio
import base64
import functools
from dataclasses import replace

from token_saver.ledger import Ledger
from token_saver.normalize.delta import DeltaStore
from token_saver.optimizer import (
    Attachment,
    normalize_attachments,
)
from token_saver.optimizer import (
    optimize_payload as _optimize_payload,
)
from token_saver.providers import provider_for
from token_saver.types import OptimizerConfig

_config = OptimizerConfig()
_ledger = Ledger()
_delta_store = DeltaStore()


def configure(
    *,
    model: str | None = None,
    enable_compression: bool | None = None,
    inject_brevity: bool | None = None,
    max_output_tokens: int | None = -1,
    compression_keep_ratio: float | None = None,
) -> None:
    """Set library-wide defaults. Lossless-only unless ``enable_compression=True``."""
    global _config
    changes: dict = {}
    if model is not None:
        changes["model"] = model
    if enable_compression is not None:
        changes["enable_compression"] = enable_compression
    if inject_brevity is not None:
        changes["inject_brevity"] = inject_brevity
    if max_output_tokens != -1:  # sentinel: -1 means "unchanged", None is a valid value
        changes["max_output_tokens"] = max_output_tokens
    if compression_keep_ratio is not None:
        changes["compression_keep_ratio"] = compression_keep_ratio
    _config = replace(_config, **changes)


def _config_for(model: str | None) -> OptimizerConfig:
    chosen = model or _config.model
    return replace(_config, model=chosen, provider=provider_for(chosen))


def optimize(payload: dict | None = None, **request) -> dict:
    """Return an optimized copy of an LLM request (a dict of create() kwargs).

    Pass either a dict or keyword arguments; everything not touched by the engine (temperature,
    tools, etc.) passes through unchanged. Records savings to the cumulative ledger.
    """
    req: dict = dict(payload) if payload else {}
    req.update(request)
    model = req.get("model") if isinstance(req.get("model"), str) else None
    cfg = _config_for(model)
    optimized_req, _results = _optimize_payload(req, cfg, _ledger, _delta_store, "lib")
    _ledger.record_call([])
    return optimized_req


def optimize_file(data: bytes, filename: str, model: str | None = None) -> dict:
    """Compress a single attachment losslessly. Returns text + token counts + change descriptions."""
    cfg = _config_for(model)
    texts, result = normalize_attachments(
        [Attachment(filename, data)], "lib", cfg, _delta_store, _ledger
    )
    return {
        "text": texts.get(filename, ""),
        "tokens_before": result.tokens_before,
        "tokens_after": result.tokens_after,
        "changes": [c.description for c in result.changes],
    }


def optimize_file_b64(content_base64: str, filename: str, model: str | None = None) -> dict:
    """Like ``optimize_file`` but takes base64-encoded bytes (handy from JSON contexts)."""
    return optimize_file(base64.b64decode(content_base64), filename, model)


def optimized(fn):
    """Wrap any create-callable so its request is optimized before the call. Sync or async."""
    if asyncio.iscoroutinefunction(fn):

        @functools.wraps(fn)
        async def awrapper(*args, **kwargs):
            return await fn(*args, **optimize(**kwargs))

        return awrapper

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        return fn(*args, **optimize(**kwargs))

    return wrapper


def wrap(client):
    """Drop-in: optimize every call made through a known client (OpenAI- or Anthropic-shaped).

    Patches the client's chat/messages create method in place and returns it. For any other SDK,
    use ``optimized(client.<create_method>)`` directly — that works universally.
    """
    # OpenAI-shaped: client.chat.completions.create
    chat = getattr(client, "chat", None)
    completions = getattr(chat, "completions", None)
    if completions is not None and hasattr(completions, "create"):
        completions.create = optimized(completions.create)
        return client
    # Anthropic-shaped: client.messages.create
    messages = getattr(client, "messages", None)
    if messages is not None and hasattr(messages, "create"):
        messages.create = optimized(messages.create)
        return client
    raise TypeError(
        "wrap() doesn't recognize this client; use optimized(client.<create>) instead "
        "(it works with any provider/SDK)."
    )


def savings() -> dict:
    """Cumulative optimization totals: tokens_saved, tokens_processed, by_feature, calls."""
    return _ledger.totals()


def reset_savings() -> None:
    _ledger.reset()
