"""Thin wrapper turning any file into markdown text. Never reimplement parsing — wrap MarkItDown."""

import io
from pathlib import Path

from markitdown import MarkItDown

# Binary formats MarkItDown must parse (text is locked inside a container).
_BINARY_EXTS = {".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".html", ".htm"}

# Binary-classified formats whose bytes are still decodable text if MarkItDown fails.
_FALLBACK_DECODE_EXTS = {".html", ".htm"}

# Magic-byte signatures so we reject corrupt/mislabeled binaries before handing them to
# MarkItDown (which is lenient and stringifies failures rather than raising).
_ZIP_MAGIC = b"PK\x03\x04"
_MAGIC_BY_EXT = {
    ".pdf": (b"%PDF",),
    ".docx": (_ZIP_MAGIC,),
    ".pptx": (_ZIP_MAGIC,),
    ".xlsx": (_ZIP_MAGIC,),
    ".xls": (b"\xd0\xcf\x11\xe0",),  # OLE2 compound document
}

_markitdown = MarkItDown()


class ExtractionError(Exception):
    """Raised when a binary file cannot be parsed and is not decodable as text."""


def is_binary_format(filename: str) -> bool:
    """True for container formats whose text must be extracted (pdf/docx/pptx/xlsx/html)."""
    return Path(filename).suffix.lower() in _BINARY_EXTS


def _magic_ok(ext: str, data: bytes) -> bool:
    """Whether ``data`` carries the expected signature for ``ext`` (no signature → assume ok)."""
    signatures = _MAGIC_BY_EXT.get(ext)
    if signatures is None:
        return True
    return any(data.startswith(sig) for sig in signatures)


def extract_to_markdown(data: bytes, filename: str) -> str:
    """Return the markdown/plain text of ``data``.

    Binary formats go through MarkItDown; on failure they fall back to a replace-decode for
    text-like extensions, otherwise raise ``ExtractionError``. Text formats bypass MarkItDown
    entirely and are decoded directly so they round-trip unchanged.
    """
    ext = Path(filename).suffix.lower()
    if is_binary_format(filename):
        if not _magic_ok(ext, data):
            return _fallback_or_raise(data, ext, filename, None)
        try:
            result = _markitdown.convert_stream(io.BytesIO(data), file_extension=ext)
            text = result.text_content
        except Exception as exc:
            return _fallback_or_raise(data, ext, filename, exc)
        # MarkItDown returns text_content=None when it cannot parse the container.
        if text is None:
            return _fallback_or_raise(data, ext, filename, None)
        return text
    return data.decode("utf-8", errors="replace")


def _fallback_or_raise(data: bytes, ext: str, filename: str, exc: Exception | None) -> str:
    if ext in _FALLBACK_DECODE_EXTS:
        return data.decode("utf-8", errors="replace")
    raise ExtractionError(f"could not extract text from {filename}") from exc
