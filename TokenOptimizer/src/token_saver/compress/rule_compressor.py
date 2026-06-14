"""Rule-based prompt compression driven by shared/compression_rules.json.

The same rule file drives the TypeScript engine in the browser extension (T22), so patterns stay
in the JS-compatible regex subset. ``scope:"prose"`` rules never touch fenced code blocks or
inline backtick spans. Rules apply in file order; each firing rule records one Change.
"""

import json
import os
import re
from functools import lru_cache
from pathlib import Path

from token_saver.types import Change

DEFAULT_RULES_PATH = Path(__file__).resolve().parents[3] / "shared" / "compression_rules.json"

# Protect fenced code blocks, inline backtick spans, and double-quoted / smart-quoted spans from
# every prose rule. (Single quotes are NOT protected — they collide with apostrophes.)
_SPLIT_RE = re.compile(r"(```[\s\S]*?```|`[^`\n]*`|\"[^\"\n]*\"|“[^”\n]*”)")
_SENTENCE_RE = re.compile(r"[^.!?]*[.!?]+|\S+$")


@lru_cache(maxsize=8)
def load_rules(rules_path: str) -> tuple:
    data = json.loads(Path(rules_path).read_text(encoding="utf-8"))
    return tuple(data.get("rules", []))


def _resolve_path(rules_path: Path | None) -> str:
    if rules_path is not None:
        return str(rules_path)
    return os.getenv("TS_RULES_PATH", str(DEFAULT_RULES_PATH))


def _split_protected(text: str) -> list[tuple[bool, str]]:
    parts: list[tuple[bool, str]] = []
    idx = 0
    for m in _SPLIT_RE.finditer(text):
        if m.start() > idx:
            parts.append((False, text[idx : m.start()]))
        parts.append((True, m.group()))
        idx = m.end()
    if idx < len(text):
        parts.append((False, text[idx:]))
    if not parts:
        parts.append((False, text))
    return parts


def _flags(spec: str) -> int:
    flags = 0
    if "i" in spec:
        flags |= re.IGNORECASE
    if "m" in spec:
        flags |= re.MULTILINE
    if "s" in spec:
        flags |= re.DOTALL
    return flags


def _apply_rule(rule: dict, segment: str) -> tuple[str, int]:
    rule_type = rule["type"]
    if rule_type == "delete":
        pattern = re.compile(rule["pattern"], _flags(rule.get("flags", "")))
        return pattern.subn("", segment)
    if rule_type == "replace":
        pattern = re.compile(rule["pattern"], _flags(rule.get("flags", "")))
        return pattern.subn(rule["replacement"], segment)
    if rule_type == "squeeze_ws":
        return re.subn(r"[ \t]{2,}", " ", segment)
    if rule_type == "dedup_sentences":
        return _dedup_sentences(segment)
    return segment, 0


def _dedup_sentences(segment: str) -> tuple[str, int]:
    sentences = _SENTENCE_RE.findall(segment)
    out: list[str] = []
    removed = 0
    prev_norm = None
    for sentence in sentences:
        norm = sentence.strip().casefold()
        if norm and norm == prev_norm:
            removed += 1
            continue
        out.append(sentence)
        prev_norm = norm
    return ("".join(out), removed) if removed else (segment, 0)


def apply_compression_rules(
    text: str, rules_path: Path | None = None, *, include_lossy: bool = False
) -> tuple[str, list[Change]]:
    """Apply prose rules in order; return the compressed text and one Change per firing rule.

    By default only ``tier:"safe"`` rules run (pure scaffolding removal — meaning preserved). Set
    ``include_lossy=True`` to also run ``tier:"lossy"`` rules (intensifiers/hedges; opt-in).
    """
    rules = load_rules(_resolve_path(rules_path))
    if not include_lossy:
        rules = tuple(r for r in rules if r.get("tier", "safe") == "safe")
    parts = _split_protected(text)
    changes: list[Change] = []

    for rule in rules:
        count = 0
        new_parts: list[tuple[bool, str]] = []
        for is_code, seg in parts:
            if is_code or rule.get("scope") == "prose" and not seg.strip():
                new_parts.append((is_code, seg))
                continue
            new_seg, fired = _apply_rule(rule, seg)
            count += fired
            new_parts.append((is_code, new_seg))
        parts = new_parts
        if count > 0:
            changes.append(
                Change(
                    kind=rule["id"],
                    description=f"{rule['id']} applied x{count}",
                    tokens_saved=0,
                )
            )

    return "".join(seg for _, seg in parts), changes
