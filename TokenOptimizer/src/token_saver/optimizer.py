"""Engine orchestrator. Glues the normalizers, dedup, and delta behind one call.

Extended in T13 (cache optimization) and T14 (response budgeting); the proxy (T17) drives all
features in sequence. Normalizer failures are logged and degrade to a no-op — a bad file never
crashes the request.
"""

import base64
import logging
from dataclasses import dataclass

from token_saver.cache_optimizer import optimize_for_cache
from token_saver.ledger import Ledger
from token_saver.normalize.code import CodeNormalizer
from token_saver.normalize.dedup import dedup_chunks
from token_saver.normalize.delta import DeltaStore
from token_saver.normalize.extract import ExtractionError, extract_to_markdown, is_binary_format
from token_saver.normalize.structured import CsvNormalizer, JsonYamlNormalizer
from token_saver.normalize.textclean import TextCleanNormalizer
from token_saver.response_budget import apply_response_budget
from token_saver.tokens import count_tokens
from token_saver.types import Change, OptimizationResult, OptimizerConfig

_MEDIA_EXT = {
    "application/json": ".json",
    "text/csv": ".csv",
    "text/tab-separated-values": ".tsv",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/pdf": ".pdf",
    "text/html": ".html",
    "application/yaml": ".yaml",
    "text/yaml": ".yaml",
}

logger = logging.getLogger(__name__)

_JSON_YAML = JsonYamlNormalizer()
_CSV = CsvNormalizer()
_CODE = CodeNormalizer()
_TEXTCLEAN = TextCleanNormalizer()
_FORMAT_NORMALIZERS = (_JSON_YAML, _CSV, _CODE)


@dataclass
class Attachment:
    filename: str
    data: bytes


def normalize_attachments(
    attachments: list[Attachment],
    session_id: str,
    config: OptimizerConfig,
    delta_store: DeltaStore,
    ledger: Ledger,
) -> tuple[dict[str, str], OptimizationResult]:
    """Normalize every attachment, dedup across them, delta-encode resends; record to the ledger."""
    model = config.model
    texts: dict[str, str] = {}
    changes: list[Change] = []
    tokens_before = 0

    for att in attachments:
        try:
            extracted = extract_to_markdown(att.data, att.filename)
        except ExtractionError:
            logger.warning("extraction failed for %s; using replace-decoded bytes", att.filename)
            extracted = att.data.decode("utf-8", errors="replace")
        tokens_before += count_tokens(extracted, model).count

        text = extracted
        # Binary extraction output always gets a text-cleanup pass (PDF artifacts etc.).
        if is_binary_format(att.filename):
            text = _safe_normalize(_TEXTCLEAN, text, att.filename, model, changes)

        fmt = _select_format_normalizer(att.filename)
        if fmt is not None:
            text = _safe_normalize(fmt, text, att.filename, model, changes)
        elif not is_binary_format(att.filename):
            text = _safe_normalize(_TEXTCLEAN, text, att.filename, model, changes)

        texts[att.filename] = text

    # Cross-file: dedup identical paragraphs, then delta-encode resent files.
    try:
        texts, dedup_changes = dedup_chunks(texts, model)
        changes.extend(dedup_changes)
    except Exception:
        logger.exception("dedup pass failed; skipping")

    for filename in list(texts):
        key = f"{filename}|{session_id}"
        try:
            payload, change = delta_store.process(key, texts[filename], model)
            texts[filename] = payload
            if change is not None:
                changes.append(change)
        except Exception:
            logger.exception("delta pass failed for %s; skipping", filename)

    tokens_after = sum(count_tokens(t, model).count for t in texts.values())
    result = OptimizationResult(
        feature="normalization",
        tokens_before=tokens_before,
        tokens_after=tokens_after,
        changes=changes,
    )
    ledger.record(result)
    return texts, result


def collect_document_attachments(payload: dict) -> tuple[list[Attachment], list[tuple]]:
    """Find base64 document blocks in an Anthropic/OpenAI-shaped payload and where they sit."""
    attachments: list[Attachment] = []
    placements: list[tuple] = []
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return attachments, placements
    counter = 0
    for msg in messages:
        content = msg.get("content") if isinstance(msg, dict) else None
        if not isinstance(content, list):
            continue
        for i, block in enumerate(content):
            if not isinstance(block, dict) or block.get("type") != "document":
                continue
            source = block.get("source") or {}
            if source.get("type") != "base64" or not isinstance(source.get("data"), str):
                continue
            try:
                data = base64.b64decode(source["data"])
            except (ValueError, TypeError):
                continue
            ext = _MEDIA_EXT.get(source.get("media_type", ""), ".txt")
            fname = f"attachment_{counter}{ext}"
            counter += 1
            attachments.append(Attachment(fname, data))
            placements.append((content, i, fname))
    return attachments, placements


def apply_attachment_texts(placements: list[tuple], texts: dict[str, str]) -> None:
    for content, index, fname in placements:
        if fname in texts:
            content[index] = {"type": "text", "text": texts[fname]}


def optimize_payload(
    payload: dict,
    config: OptimizerConfig,
    ledger: Ledger,
    delta_store: DeltaStore,
    session_id: str = "session",
) -> tuple[dict, list[OptimizationResult]]:
    """Run the full secret-free engine over a request payload. Shared by the proxy and the demo.

    Normalizes document attachments, optimizes for cache, optionally compresses prose, and applies
    response-budget hints. Returns the optimized payload and one OptimizationResult per feature.
    """
    results: list[OptimizationResult] = []

    attachments, placements = collect_document_attachments(payload)
    if attachments:
        texts, norm_res = normalize_attachments(
            attachments, session_id, config, delta_store, ledger
        )
        apply_attachment_texts(placements, texts)
        results.append(norm_res)

    payload, cache_res = optimize_for_cache(payload, config, ledger)
    results.append(cache_res)

    if config.enable_compression:
        from token_saver.compress import compress_payload

        payload, comp_res = compress_payload(payload, config, ledger)
        results.append(comp_res)

    payload, budget_res = apply_response_budget(payload, config, ledger)
    results.append(budget_res)
    return payload, results


def compress_text(text: str, config: OptimizerConfig) -> tuple[str, OptimizationResult]:
    """Rule pass always; classifier pass only if enabled and the model is ready. Pure (no ledger)."""
    from token_saver.compress.rule_compressor import apply_compression_rules

    before = count_tokens(text, config.model).count
    # Safe scaffolding rules always; intensifier/hedge (lossy) rules only when opted in.
    out, changes = apply_compression_rules(text, include_lossy=config.enable_compression)
    if config.enable_compression:
        try:
            from token_saver.compress.classifier import ClassifierCompressor, ModelNotReady

            try:
                out, classifier_changes = ClassifierCompressor().compress(
                    out, keep_ratio=config.compression_keep_ratio
                )
                changes = changes + classifier_changes
            except ModelNotReady:
                logger.debug("classifier model not ready; rule pass only")
        except ImportError:
            logger.debug("classifier dependencies unavailable; rule pass only")
    after = count_tokens(out, config.model).count
    return out, OptimizationResult(
        feature="compression", tokens_before=before, tokens_after=after, changes=changes
    )


def _select_format_normalizer(filename: str):
    for normalizer in _FORMAT_NORMALIZERS:
        if normalizer.supports(filename):
            return normalizer
    return None


def _safe_normalize(normalizer, text: str, filename: str, model: str, changes: list[Change]) -> str:
    try:
        res = normalizer.normalize(text, filename, model)
        changes.extend(res.changes)
        return res.text
    except Exception:
        logger.exception("normalizer %s failed on %s; keeping pre-failure text", normalizer.name, filename)
        return text
