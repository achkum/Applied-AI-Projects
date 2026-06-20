"""MCP endpoint (Plug 2): expose the engine as tools an agent can call explicitly.

Transport is stdio (primary) — run with ``token-optimizer mcp`` and register in
``claude_desktop_config.json``. Every tool delegates to the same engine functions the proxy
uses and records to one shared Ledger, so the savings counter is consistent across plugs.
"""

import base64
import json
import logging

from mcp.server.fastmcp import FastMCP

from app.cache.cache_optimizer import optimize_for_cache as _optimize_for_cache
from app.core.ledger import Ledger
from app.core.tokens import count_tokens as _count_tokens
from app.core.tokens import provider_for
from app.core.types import OptimizationResult, OptimizerConfig
from app.normalize.dedup import dedup_chunks
from app.normalize.delta import DeltaStore
from app.optimizer import Attachment, normalize_attachments

logger = logging.getLogger(__name__)

mcp = FastMCP("token-optimizer")
ledger = Ledger()


def _config(model: str) -> OptimizerConfig:
    return OptimizerConfig(model=model, provider=provider_for(model))


@mcp.tool()
def count_tokens(text: str, model: str) -> dict:
    """Count tokens in text for a model. Exact for OpenAI (tiktoken); a heuristic for Anthropic.

    Use this before sending content to a model to see how large it is. ``exact`` is false when
    the count is the Anthropic heuristic.
    """
    tc = _count_tokens(text, model)
    return {"count": tc.count, "exact": tc.exact}


@mcp.tool()
def normalize_attachment(filename: str, content_base64: str, model: str) -> dict:
    """Normalize one attached file losslessly (minify JSON, compact CSV, clean PDF text, trim code).

    Use before attaching a file to a model. Returns the normalized text, token counts before and
    after, and a list of human-readable changes.
    """
    data = base64.b64decode(content_base64)
    texts, result = normalize_attachments(
        [Attachment(filename, data)], "mcp", _config(model), DeltaStore(), ledger
    )
    return {
        "text": texts.get(filename, ""),
        "tokens_before": result.tokens_before,
        "tokens_after": result.tokens_after,
        "changes": [c.description for c in result.changes],
    }


@mcp.tool()
def optimize_for_cache(payload_json: str) -> dict:
    """Restructure an Anthropic/OpenAI messages payload for maximum prefix-cache hits.

    Hoists volatile content out of the cacheable prefix and injects cache_control markers.
    Nothing is removed. Returns the rewritten payload JSON and a list of changes.
    """
    payload = json.loads(payload_json)
    model = payload.get("model", "claude-sonnet-4-5")
    new_payload, result = _optimize_for_cache(payload, _config(model), ledger)
    return {
        "payload_json": json.dumps(new_payload),
        "changes": [c.description for c in result.changes],
    }


@mcp.tool()
def compress_prompt(text: str, target_ratio: float, model: str) -> dict:
    """Compress a prompt through the shared compression service (the LLMLingua-2 model), configured
    via ``TS_COMPRESS_URL`` — the same path the library and extension use, so results are
    consistent. If the service isn't configured or is unreachable, the text is returned unchanged.
    """
    from app.optimizer import compress_text

    cfg = OptimizerConfig(
        model=model,
        provider=provider_for(model),
        enable_compression=True,
        compression_keep_ratio=target_ratio,
    )
    out, result = compress_text(text, cfg)
    ledger.record(result)
    return {
        "text": out,
        "tokens_before": result.tokens_before,
        "tokens_after": result.tokens_after,
    }


@mcp.tool()
def dedupe_context(named_texts: dict[str, str], model: str) -> dict:
    """Collapse paragraphs that repeat across several documents to a single copy.

    Use when sending multiple files that share boilerplate. Returns the deduped texts and a list
    of changes. Code fences are never deduped.
    """
    texts, changes = dedup_chunks(named_texts, model)
    before = sum(_count_tokens(t, model).count for t in named_texts.values())
    after = sum(_count_tokens(t, model).count for t in texts.values())
    ledger.record(
        OptimizationResult(
            feature="normalization", tokens_before=before, tokens_after=after, changes=changes
        )
    )
    return {"texts": texts, "changes": [c.description for c in changes]}


def main() -> None:
    """Run the MCP server over stdio."""
    mcp.run()


if __name__ == "__main__":
    main()
