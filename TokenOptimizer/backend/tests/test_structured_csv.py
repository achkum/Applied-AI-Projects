import csv
import io

from app.normalize.structured import CsvNormalizer

NORM = CsvNormalizer()
MODEL = "gpt-4o"


def cells(text, delimiter):
    return list(csv.reader(io.StringIO(text), delimiter=delimiter))


def test_supports():
    assert NORM.supports("data.csv")
    assert NORM.supports("data.tsv")
    assert not NORM.supports("data.json")


def test_quoted_csv_with_commas_converts_to_tsv_value_identical():
    src = 'name,note\n"Smith, John","says ""hi"""\nDoe,plain\n'
    res = NORM.normalize(src, "x.csv", MODEL)
    assert res.guarantee == "value-identical"
    # Parse both sides and compare cell-for-cell.
    assert cells(res.text, "\t") == cells(src, ",")
    assert any(c.kind == "csv_to_tsv" for c in res.changes)


def test_strips_empty_trailing_columns_and_rows():
    src = "a,b,,\n1,2,,\n\n3,4,,\n"
    res = NORM.normalize(src, "x.csv", MODEL)
    parsed = cells(res.text, "\t")
    # Trailing empty columns and the blank row are gone.
    assert parsed == [["a", "b"], ["1", "2"], ["3", "4"]]
    kinds = {c.kind for c in res.changes}
    assert "strip_empty_columns" in kinds
    assert "strip_empty_rows" in kinds


def test_pathological_input_passes_through():
    src = "thisisjustonelongtokenwithnodelimiters"
    res = NORM.normalize(src, "x.csv", MODEL)
    assert res.text == src
    assert res.changes == []
