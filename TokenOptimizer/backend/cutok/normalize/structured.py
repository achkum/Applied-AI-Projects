"""Structured-data normalizers: JSON/YAML minification and CSV→TSV compaction.

Both guarantee ``value-identical`` output: parse both sides and the data structures compare
equal. Invalid input is returned untouched — never corrupt.
"""

import csv
import io
import json
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

from cutok.core.tokens import count_tokens
from cutok.core.types import Change, NormalizeResult

# Key-dictionary thresholds (see T06): only long, frequently repeated keys are worth aliasing.
_KEY_MIN_LEN = 12
_KEY_MIN_COUNT = 10


class JsonYamlNormalizer:
    name = "json_yaml"

    def supports(self, filename: str) -> bool:
        return Path(filename).suffix.lower() in {".json", ".yaml", ".yml"}

    def normalize(self, text: str, filename: str, model: str) -> NormalizeResult:
        ext = Path(filename).suffix.lower()
        is_yaml = ext in {".yaml", ".yml"}
        try:
            obj = yaml.safe_load(text) if is_yaml else json.loads(text)
        except (json.JSONDecodeError, yaml.YAMLError, ValueError):
            return NormalizeResult(text=text, changes=[], guarantee="value-identical")
        if obj is None:
            return NormalizeResult(text=text, changes=[], guarantee="value-identical")

        changes: list[Change] = []
        minified = json.dumps(obj, separators=(",", ":"), ensure_ascii=False, sort_keys=False)

        before = count_tokens(text, model).count
        after = count_tokens(minified, model).count
        if minified != text:
            kind = "yaml_to_json" if is_yaml else "minify_json"
            desc = "converted YAML to minified JSON" if is_yaml else "minified JSON"
            changes.append(Change(kind=kind, description=desc, tokens_saved=before - after))

        current = minified
        keymapped = self._apply_key_dictionary(obj, model)
        if keymapped is not None:
            kept = count_tokens(keymapped, model).count
            if kept < count_tokens(current, model).count:
                changes.append(
                    Change(
                        kind="key_dictionary",
                        description="aliased long repeated keys via KEYMAP header",
                        tokens_saved=count_tokens(current, model).count - kept,
                    )
                )
                current = keymapped

        return NormalizeResult(text=current, changes=changes, guarantee="value-identical")

    def _apply_key_dictionary(self, obj: Any, model: str) -> str | None:
        """Return a KEYMAP-prefixed minified body, or None if no key qualifies."""
        counter: Counter[str] = Counter()
        _count_keys(obj, counter)
        targets = sorted(
            k for k, n in counter.items() if len(k) >= _KEY_MIN_LEN and n >= _KEY_MIN_COUNT
        )
        if not targets:
            return None
        mapping = {orig: f"k{i + 1}" for i, orig in enumerate(targets)}
        renamed = _rename_keys(obj, mapping)
        # KEYMAP maps short -> original so a consumer can restore exactly.
        restore = {short: orig for orig, short in mapping.items()}
        header = "KEYMAP: " + json.dumps(restore, separators=(",", ":"), ensure_ascii=False)
        body = json.dumps(renamed, separators=(",", ":"), ensure_ascii=False)
        return f"{header}\n{body}"


class CsvNormalizer:
    name = "csv"

    def supports(self, filename: str) -> bool:
        return Path(filename).suffix.lower() in {".csv", ".tsv"}

    def normalize(self, text: str, filename: str, model: str) -> NormalizeResult:
        # Only sniff the unambiguous common delimiters. ';'/'|' appear too often as cell content
        # to guess safely, and a wrong guess would silently corrupt values.
        try:
            delimiter = csv.Sniffer().sniff(text[:4096], delimiters=",\t").delimiter
        except csv.Error:
            return NormalizeResult(text=text, changes=[], guarantee="value-identical")

        # Use only the detected delimiter with standard RFC-4180 quoting — never the sniffer's
        # guessed quoting params, which can mis-unescape cells that contain quote characters.
        rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
        if not rows:
            return NormalizeResult(text=text, changes=[], guarantee="value-identical")

        changes: list[Change] = []

        # "Empty" means the empty string, not whitespace: a cell of " " is real data and must
        # survive (value-identical). Only structurally-empty rows/columns are dropped.
        non_empty = [r for r in rows if any(cell for cell in r)]
        if len(non_empty) < len(rows):
            changes.append(
                Change(
                    kind="strip_empty_rows",
                    description=f"removed {len(rows) - len(non_empty)} empty row(s)",
                    tokens_saved=0,
                )
            )
        rows = non_empty
        if not rows:
            return NormalizeResult(text=text, changes=[], guarantee="value-identical")

        width = max(len(r) for r in rows)
        padded = [r + [""] * (width - len(r)) for r in rows]
        keep = width
        while keep > 0 and all(not row[keep - 1] for row in padded):
            keep -= 1
        if keep < width:
            changes.append(
                Change(
                    kind="strip_empty_columns",
                    description=f"removed {width - keep} trailing empty column(s)",
                    tokens_saved=0,
                )
            )
        trimmed = [row[:keep] for row in padded]

        out = io.StringIO()
        writer = csv.writer(out, delimiter="\t", lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        writer.writerows(trimmed)
        result = out.getvalue()

        # Value-identical-or-revert: the emitted TSV must re-parse to exactly the cells we kept.
        if list(csv.reader(io.StringIO(result), delimiter="\t")) != trimmed:
            return NormalizeResult(text=text, changes=[], guarantee="value-identical")

        before = count_tokens(text, model).count
        after = count_tokens(result, model).count
        changes.append(
            Change(kind="csv_to_tsv", description="compacted CSV to TSV", tokens_saved=before - after)
        )
        return NormalizeResult(text=result, changes=changes, guarantee="value-identical")


def _count_keys(obj: Any, counter: Counter[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(k, str):
                counter[k] += 1
            _count_keys(v, counter)
    elif isinstance(obj, list):
        for item in obj:
            _count_keys(item, counter)


def _rename_keys(obj: Any, mapping: dict[str, str]) -> Any:
    if isinstance(obj, dict):
        return {mapping.get(k, k): _rename_keys(v, mapping) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_rename_keys(item, mapping) for item in obj]
    return obj
