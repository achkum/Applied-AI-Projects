"""Property-based tests for the lossless guarantees — invariants over generated input, not
hand-tuned fixtures. If any of these can be broken, the 'lossless-first' claim is false.
"""

import ast
import csv
import io
import json

from app.normalize.code import CodeNormalizer
from app.normalize.structured import CsvNormalizer, JsonYamlNormalizer
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

# These tests lazy-load real tokenizers (tiktoken) on the first call, which can blow a short
# per-example deadline; correctness, not latency, is what we're asserting here.
settings.register_profile("engine", deadline=None, suppress_health_check=[HealthCheck.too_slow])
settings.load_profile("engine")

MODEL = "gpt-4o"

# --- JSON: value-identical guarantee (incl. the KEYMAP key-dictionary path) ------------------

_json = st.recursive(
    st.none() | st.booleans() | st.integers() | st.text(),
    lambda children: st.lists(children, max_size=5)
    | st.dictionaries(st.text(min_size=1, max_size=20), children, max_size=5),
    max_leaves=20,
)


def _rename_back(obj, keymap):
    if isinstance(obj, dict):
        return {keymap.get(k, k): _rename_back(v, keymap) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_rename_back(v, keymap) for v in obj]
    return obj


def _decode(text):
    if text.startswith("KEYMAP: "):
        header, body = text.split("\n", 1)
        return _rename_back(json.loads(body), json.loads(header[len("KEYMAP: ") :]))
    return json.loads(text)


@given(obj=st.dictionaries(st.text(min_size=1, max_size=20), _json, max_size=6))
def test_json_normalization_is_value_identical(obj):
    res = JsonYamlNormalizer().normalize(json.dumps(obj), "x.json", MODEL)
    assert res.guarantee == "value-identical"
    assert _decode(res.text) == obj


# --- CSV: cell values are identical (rectangular, non-empty → no trimming ambiguity) ---------

_cell = st.text(
    alphabet=st.characters(blacklist_characters="\t\r\n", min_codepoint=32, max_codepoint=126),
    min_size=1,
    max_size=12,
)


@given(data=st.lists(st.lists(_cell, min_size=1, max_size=4), min_size=1, max_size=6))
def test_csv_to_tsv_preserves_every_cell(data):
    width = max(len(row) for row in data)
    rect = [row + ["x"] * (width - len(row)) for row in data]  # rectangular, all cells non-empty
    buf = io.StringIO()
    csv.writer(buf).writerows(rect)
    src = buf.getvalue()
    res = CsvNormalizer().normalize(src, "x.csv", MODEL)
    # Value-identical guarantee: either compacted to TSV with identical cells, or — when the
    # input is ambiguous — passed through untouched. Never corrupted.
    if any(c.kind == "csv_to_tsv" for c in res.changes):
        assert list(csv.reader(io.StringIO(res.text), delimiter="\t")) == rect
    else:
        assert res.text == src


# --- Code: AST-identical under trailing-whitespace / blank-line noise -------------------------

_BASE_PY = (
    "def f(x):\n    y = x + 1\n    return y\n\n\nclass A:\n    def m(self):\n        return 42\n"
)


@given(
    pad=st.lists(st.integers(min_value=0, max_value=6), min_size=1, max_size=10),
    trailing_blanks=st.integers(min_value=0, max_value=6),
)
def test_code_normalizer_preserves_ast(pad, trailing_blanks):
    lines = _BASE_PY.split("\n")
    noisy = "\n".join(ln + " " * pad[i % len(pad)] for i, ln in enumerate(lines))
    noisy += "\n" * trailing_blanks
    res = CodeNormalizer().normalize(noisy, "m.py", MODEL)
    assert ast.dump(ast.parse(res.text)) == ast.dump(ast.parse(_BASE_PY))
