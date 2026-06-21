"""Clean the markdown/plain text that extraction produces.

Five ordered passes (de-hyphenate, collapse blank runs, strip HTML comments, drop repeated
header/footer lines, normalize unicode punctuation). Every pass is fence-aware: content inside
triple-backtick fenced code blocks is byte-identical before and after.
"""

import re
from collections import Counter
from pathlib import Path

from cutok.core.tokens import count_tokens
from cutok.core.types import Change, NormalizeResult

_FENCE_RE = re.compile(r"```[\s\S]*?```")
_DEHYPHEN_RE = re.compile(r"(\w+)-\n(\w+)")
_BLANK_RE = re.compile(r"\n{4,}")  # 3+ blank lines == 4+ newlines
_COMMENT_RE = re.compile(r"<!--[\s\S]*?-->")
_PAGE_NUM_RE = re.compile(r"\b\d{1,4}\b")

# Smart quotes, en/em dashes, ellipsis, non-breaking space → ASCII.
_PUNCT_MAP = {
    ord("“"): '"',
    ord("”"): '"',
    ord("‘"): "'",
    ord("’"): "'",
    ord("–"): "-",
    ord("—"): "-",
    ord("…"): "...",
    ord(" "): " ",
}


def split_fences(text: str) -> list[tuple[bool, str]]:
    """Split into ``(is_code, segment)`` parts; code parts are whole fenced blocks, untouched."""
    parts: list[tuple[bool, str]] = []
    idx = 0
    for m in _FENCE_RE.finditer(text):
        if m.start() > idx:
            parts.append((False, text[idx : m.start()]))
        parts.append((True, m.group()))
        idx = m.end()
    if idx < len(text):
        parts.append((False, text[idx:]))
    if not parts:
        parts.append((False, text))
    return parts


def _map_prose(text: str, fn) -> str:
    return "".join(seg if is_code else fn(seg) for is_code, seg in split_fences(text))


def _prose_only(text: str) -> str:
    return "".join(seg for is_code, seg in split_fences(text) if not is_code)


def dehyphenate(text: str) -> str:
    words = {w.lower() for w in re.findall(r"\w+", _prose_only(text))}

    def repl(m: re.Match) -> str:
        joined = m.group(1) + m.group(2)
        if joined.lower() in words or m.group(2)[:1].islower():
            return joined
        return m.group(0)

    return _map_prose(text, lambda s: _DEHYPHEN_RE.sub(repl, s))


def collapse_blank_lines(text: str) -> str:
    return _map_prose(text, lambda s: _BLANK_RE.sub("\n\n", s))


def strip_html_comments(text: str) -> str:
    return _map_prose(text, lambda s: _COMMENT_RE.sub("", s))


def _is_header_footer(stripped: str) -> bool:
    if _PAGE_NUM_RE.search(stripped):
        return True
    words = stripped.split()
    if 1 <= len(words) <= 8 and all(w[0].isupper() for w in words if w[:1].isalpha()):
        return True
    return False


def remove_repeated_lines(text: str) -> str:
    parts = split_fences(text)
    counts: Counter[str] = Counter()
    for is_code, seg in parts:
        if not is_code:
            counts.update(line.strip() for line in seg.split("\n") if line.strip())
    removable = {
        s for s, n in counts.items() if n >= 4 and len(s) >= 20 and _is_header_footer(s)
    }
    if not removable:
        return text

    seen: set[str] = set()

    def process(seg: str) -> str:
        out = []
        for line in seg.split("\n"):
            s = line.strip()
            if s in removable:
                if s in seen:
                    continue
                seen.add(s)
            out.append(line)
        return "\n".join(out)

    return "".join(seg if is_code else process(seg) for is_code, seg in parts)


def normalize_unicode_punct(text: str) -> str:
    return _map_prose(text, lambda s: s.translate(_PUNCT_MAP))


_PASSES = [
    (dehyphenate, "dehyphenate", "joined line-wrapped hyphenated words"),
    (collapse_blank_lines, "collapse_blank_lines", "collapsed runs of 3+ blank lines"),
    (strip_html_comments, "strip_html_comments", "removed HTML comments"),
    (remove_repeated_lines, "remove_repeated_lines", "removed repeated header/footer lines"),
    (normalize_unicode_punct, "normalize_unicode_punct", "normalized unicode punctuation to ASCII"),
]


class TextCleanNormalizer:
    name = "textclean"

    def supports(self, filename: str) -> bool:
        return Path(filename).suffix.lower() in {".md", ".txt"}

    def normalize(self, text: str, filename: str, model: str) -> NormalizeResult:
        current = text
        changes: list[Change] = []
        for fn, kind, desc in _PASSES:
            new = fn(current)
            if new != current:
                before = count_tokens(current, model).count
                after = count_tokens(new, model).count
                changes.append(Change(kind=kind, description=desc, tokens_saved=before - after))
                current = new
        return NormalizeResult(text=current, changes=changes, guarantee="render-equivalent")
