"""Trim code attachments with an AST-identical guarantee where checkable (Python).

Single-file passes: strip trailing whitespace, collapse blank-line runs. Cross-file pass:
dedup an identical leading license-header comment block across a fileset. Comments are never
otherwise touched. For ``.py`` files the result is reverted to the original if the AST changes
(e.g. trailing whitespace inside a triple-quoted string is meaningful), so the guarantee holds.
"""

import ast
import hashlib
import re
from collections import defaultdict
from pathlib import Path

from tokenoptim.core.tokens import count_tokens
from tokenoptim.core.types import Change, NormalizeResult

_LINE_COMMENT = {
    ".py": "#",
    ".rb": "#",
    ".sh": "#",
    ".pl": "#",
    ".js": "//",
    ".ts": "//",
    ".jsx": "//",
    ".tsx": "//",
    ".java": "//",
    ".c": "//",
    ".cpp": "//",
    ".cc": "//",
    ".h": "//",
    ".hpp": "//",
    ".go": "//",
    ".rs": "//",
    ".cs": "//",
    ".php": "//",
    ".swift": "//",
    ".kt": "//",
    ".scala": "//",
}

_BLANK_RE = re.compile(r"\n{4,}")


def _strip_trailing(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.split("\n"))


def _collapse_blanks(text: str) -> str:
    return _BLANK_RE.sub("\n\n", text)


def _ast_equal(before: str, after: str) -> bool:
    try:
        return ast.dump(ast.parse(before)) == ast.dump(ast.parse(after))
    except SyntaxError:
        return False


class CodeNormalizer:
    name = "code"

    def supports(self, filename: str) -> bool:
        return Path(filename).suffix.lower() in _LINE_COMMENT

    def normalize(self, text: str, filename: str, model: str) -> NormalizeResult:
        ext = Path(filename).suffix.lower()
        guarantee = "ast-identical" if ext == ".py" else "render-equivalent"
        current = text
        changes: list[Change] = []
        for fn, kind, desc in (
            (_strip_trailing, "strip_trailing_ws", "stripped trailing whitespace"),
            (_collapse_blanks, "collapse_blank_lines", "collapsed runs of 3+ blank lines"),
        ):
            new = fn(current)
            if new != current:
                before = count_tokens(current, model).count
                after = count_tokens(new, model).count
                changes.append(Change(kind=kind, description=desc, tokens_saved=before - after))
                current = new

        if ext == ".py" and not _ast_equal(text, current):
            # A transform changed semantics (or the file doesn't parse) — revert to be safe.
            return NormalizeResult(text=text, changes=[], guarantee=guarantee)
        return NormalizeResult(text=current, changes=changes, guarantee=guarantee)

    def normalize_fileset(
        self, files: dict[str, str], model: str
    ) -> dict[str, NormalizeResult]:
        """Normalize each file, then dedup identical leading license headers across the set."""
        results = {name: self.normalize(text, name, model) for name, text in files.items()}

        headers: dict[str, tuple[str, str, str]] = {}  # name -> (hash, prefix, block)
        for name, res in results.items():
            prefix = _LINE_COMMENT.get(Path(name).suffix.lower())
            if not prefix:
                continue
            block = _leading_comment_block(res.text, prefix)
            if block is None:
                continue
            headers[name] = (_hash_block(block, prefix), prefix, block)

        groups: dict[str, list[str]] = defaultdict(list)
        for name, (h, _prefix, _block) in headers.items():
            groups[h].append(name)

        for names in groups.values():
            if len(names) < 2:
                continue
            ordered = sorted(names)
            first = ordered[0]
            for name in ordered[1:]:
                res = results[name]
                _h, prefix, block = headers[name]
                replacement = f"{prefix} [license header identical to {first}]"
                new_text = replacement + res.text[len(block):]
                before = count_tokens(res.text, model).count
                after = count_tokens(new_text, model).count
                res.changes.append(
                    Change(
                        kind="license_header_dedup",
                        description=f"deduped license header (identical to {first})",
                        tokens_saved=before - after,
                    )
                )
                res.text = new_text
        return results


def _leading_comment_block(text: str, prefix: str) -> str | None:
    """Return the leading run of comment lines (>=2, up to 30) as a prefix substring, else None."""
    lines = text.split("\n")
    block: list[str] = []
    for line in lines[:30]:
        if line.lstrip().startswith(prefix):
            block.append(line)
        else:
            break
    if len(block) < 2:
        return None
    return "\n".join(block)


def _hash_block(block: str, prefix: str) -> str:
    """Hash a header block ignoring indentation, the comment prefix, and surrounding whitespace."""
    norm = []
    for line in block.split("\n"):
        s = line.lstrip()
        if s.startswith(prefix):
            s = s[len(prefix):]
        norm.append(s.strip())
    return hashlib.sha256("\n".join(norm).encode("utf-8")).hexdigest()
