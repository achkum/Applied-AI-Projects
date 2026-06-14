"""Collapse identical paragraphs appearing across multiple attachments to a single copy.

A paragraph repeated (>= ``min_chunk_tokens`` tokens) in two or more documents is kept verbatim
at its first occurrence; later occurrences become a reference ``[¶ identical to ¶N in <name>]``.
Paragraphs inside fenced code blocks are never touched. Output is deterministic.
"""

import hashlib
import re
from collections import defaultdict

from token_saver.normalize.textclean import split_fences
from token_saver.tokens import count_tokens
from token_saver.types import Change

_PARA_SPLIT = re.compile(r"(\n[ \t]*\n)")  # capture blank-line separators so we can rebuild


def _tokenize(text: str) -> list[list]:
    """Break a document into [type, value, index] items: code blocks, paragraphs, separators."""
    items: list[list] = []
    for is_code, seg in split_fences(text):
        if is_code:
            items.append(["code", seg, None])
            continue
        for i, piece in enumerate(_PARA_SPLIT.split(seg)):
            items.append(["sep" if i % 2 == 1 else "para", piece, None])
    return items


def _chunk_hash(paragraph: str) -> str:
    norm = re.sub(r"\s+", " ", paragraph).strip().casefold()
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def dedup_chunks(
    named_texts: dict[str, str], model: str, min_chunk_tokens: int = 40
) -> tuple[dict[str, str], list[Change]]:
    names = sorted(named_texts)
    docs_items = {name: _tokenize(named_texts[name]) for name in names}

    hash_docs: dict[str, set[str]] = defaultdict(set)
    hash_first: dict[str, tuple[str, int]] = {}
    chunk_tokens: dict[str, int] = {}

    for name in names:
        idx = 0
        for item in docs_items[name]:
            if item[0] == "para" and item[1].strip():
                idx += 1
                item[2] = idx
                h = _chunk_hash(item[1])
                hash_docs[h].add(name)
                if h not in hash_first:
                    hash_first[h] = (name, idx)
                    chunk_tokens[h] = count_tokens(item[1], model).count

    eligible = {
        h
        for h, docs in hash_docs.items()
        if len(docs) >= 2 and chunk_tokens[h] >= min_chunk_tokens
    }

    seen: set[str] = set()
    changes: list[Change] = []
    result: dict[str, str] = {}
    for name in names:
        out: list[str] = []
        for item in docs_items[name]:
            if item[0] == "para" and item[1].strip():
                h = _chunk_hash(item[1])
                if h in eligible:
                    if h in seen:
                        kept_name, kept_idx = hash_first[h]
                        ref = f"[¶ identical to ¶{kept_idx} in {kept_name}]"
                        saved = count_tokens(item[1], model).count - count_tokens(ref, model).count
                        changes.append(
                            Change(
                                kind="dedup_chunk",
                                description=f"paragraph identical to ¶{kept_idx} in {kept_name}",
                                tokens_saved=saved,
                            )
                        )
                        out.append(ref)
                        continue
                    seen.add(h)
            out.append(item[1])
        result[name] = "".join(out)
    return result, changes
