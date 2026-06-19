import ast

from token_optimizer.normalize.code import CodeNormalizer

NORM = CodeNormalizer()
MODEL = "gpt-4o"


def test_supports():
    assert NORM.supports("a.py")
    assert NORM.supports("b.ts")
    assert not NORM.supports("c.json")


def test_python_trailing_whitespace_stripped_and_ast_identical():
    src = "def f():   \n    x = 1   \n    return x  \n"
    res = NORM.normalize(src, "m.py", MODEL)
    assert res.guarantee == "ast-identical"
    assert "   \n" not in res.text
    assert ast.dump(ast.parse(res.text)) == ast.dump(ast.parse(src))
    assert any(c.kind == "strip_trailing_ws" for c in res.changes)


def test_python_triple_quoted_trailing_space_reverts():
    # Trailing spaces inside the string literal are meaningful → stripping changes the AST → revert.
    src = 'x = """line with trailing   \nmore"""\n'
    res = NORM.normalize(src, "m.py", MODEL)
    assert res.text == src
    assert res.changes == []


def test_python_collapses_blank_lines():
    src = "a = 1\n\n\n\n\nb = 2\n"
    res = NORM.normalize(src, "m.py", MODEL)
    assert res.text == "a = 1\n\nb = 2\n"


def test_invalid_python_reverts():
    src = "def f(  :\n  pass\n"  # syntax error
    res = NORM.normalize(src + "   ", "m.py", MODEL)
    assert res.text == src + "   "
    assert res.changes == []


def test_non_python_is_render_equivalent():
    src = "const x = 1;   \n\n\n\n\nconst y = 2;  \n"
    res = NORM.normalize(src, "m.ts", MODEL)
    assert res.guarantee == "render-equivalent"
    assert "   \n" not in res.text


def test_license_header_dedup_across_files():
    header = "\n".join(f"# Copyright 2026 Acme Corp. Line {i} of the license." for i in range(10))
    a = header + "\n\ndef a():\n    return 1\n"
    b = header + "\n\ndef b():\n    return 2\n"
    results = NORM.normalize_fileset({"b_file.py": b, "a_file.py": a}, MODEL)
    # First alphabetically (a_file.py) keeps the header; the other is deduped to one line.
    assert "Copyright 2026 Acme Corp. Line 0" in results["a_file.py"].text
    assert "[license header identical to a_file.py]" in results["b_file.py"].text
    assert "Line 9 of the license" not in results["b_file.py"].text
    assert any(c.kind == "license_header_dedup" for c in results["b_file.py"].changes)
    # Deduped file still parses (comments don't affect the AST).
    ast.parse(results["b_file.py"].text)
