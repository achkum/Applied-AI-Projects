import pytest
from app.normalize.extract import (
    ExtractionError,
    extract_to_markdown,
    is_binary_format,
)


def test_is_binary_format():
    assert is_binary_format("report.pdf")
    assert is_binary_format("sheet.xlsx")
    assert is_binary_format("page.HTML")
    assert not is_binary_format("data.json")
    assert not is_binary_format("notes.md")


def test_text_files_round_trip_unchanged():
    for name in ("a.json", "b.txt", "c.py", "d.csv", "e.yaml"):
        text = '{"k": 1}\nhello\n# comment'
        assert extract_to_markdown(text.encode("utf-8"), name) == text


def test_unicode_text_round_trips():
    text = "héllo wörld 中文"
    assert extract_to_markdown(text.encode("utf-8"), "x.txt") == text


def test_html_is_extracted():
    out = extract_to_markdown(b"<html><body><h1>Title</h1><p>body</p></body></html>", "p.html")
    assert "Title" in out
    assert "<h1>" not in out


def test_unknown_binary_raises():
    with pytest.raises(ExtractionError):
        extract_to_markdown(b"\x00\x01\x02not a real docx\xff", "broken.docx")
