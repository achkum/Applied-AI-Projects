from app.normalize.textclean import (
    TextCleanNormalizer,
    collapse_blank_lines,
    dehyphenate,
    normalize_unicode_punct,
    remove_repeated_lines,
    strip_html_comments,
)

NORM = TextCleanNormalizer()
MODEL = "gpt-4o"


def test_supports():
    assert NORM.supports("a.md")
    assert NORM.supports("b.txt")
    assert not NORM.supports("c.json")


# --- Pass 1: de-hyphenate ---
def test_dehyphenate_positive():
    text = "The inter-\nnational team met.\nThe international rules apply."
    assert "international" in dehyphenate(text)
    assert "inter-\nnational" not in dehyphenate(text)


def test_dehyphenate_negative_single_line_hyphen():
    text = "This is a state-of-the-art system."
    assert dehyphenate(text) == text


# --- Pass 2: collapse blank lines ---
def test_collapse_blank_positive():
    assert collapse_blank_lines("a\n\n\n\n\nb") == "a\n\nb"


def test_collapse_blank_negative_single_blank_preserved():
    assert collapse_blank_lines("a\n\nb") == "a\n\nb"


# --- Pass 3: HTML comments ---
def test_strip_comments_positive():
    assert strip_html_comments("before<!-- secret -->after") == "beforeafter"


def test_strip_comments_negative():
    text = "no comments here at all"
    assert strip_html_comments(text) == text


# --- Pass 4: repeated header/footer lines ---
def test_remove_repeated_lines_positive():
    header = "Confidential Report Page 12 of 40"
    text = "\n".join([header, "real content one", header, "two", header, "three", header, "four"])
    out = remove_repeated_lines(text)
    assert out.count(header) == 1
    assert "real content one" in out


def test_remove_repeated_lines_negative_normal_prose():
    line = "this is an ordinary lowercase sentence with no header shape"
    text = "\n".join([line] * 4)
    # No digits, not title-cased → not a header/footer → kept.
    assert remove_repeated_lines(text).count(line) == 4


# --- Pass 5: unicode punctuation ---
def test_normalize_punct_positive():
    assert normalize_unicode_punct("“quote” – dash … end") == '"quote" - dash ... end'


def test_normalize_punct_negative_ascii_unchanged():
    text = 'plain "ascii" - text ... here'
    assert normalize_unicode_punct(text) == text


# --- Fence protection (the core guarantee) ---
def test_code_fences_byte_identical():
    code = '```python\ndef f():\n\n\n\n    x = "“smart”"  # inter-\nnational\n```'
    text = f"Prose with “smart quotes”.\n\n\n\n\n{code}\n\nMore inter-\nnational prose."
    out = NORM.normalize(text, "doc.md", MODEL).text
    assert code in out  # the fenced block survives untouched, byte-for-byte


def test_full_normalize_records_changes():
    text = "“Hi”\n\n\n\n\nplain"
    res = NORM.normalize(text, "doc.md", MODEL)
    assert res.guarantee == "render-equivalent"
    kinds = {c.kind for c in res.changes}
    assert "normalize_unicode_punct" in kinds
    assert "collapse_blank_lines" in kinds
