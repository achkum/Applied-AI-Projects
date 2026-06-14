from token_saver.compress.classifier import ClassifierCompressor, HeuristicImportanceScorer


class FakeSession:
    """Deterministic per-word scores; lower index = lower keep-probability."""

    def __init__(self, score_fn=None):
        self.score_fn = score_fn or (lambda word, i: float(i))

    def score(self, words):
        return [self.score_fn(w, i) for i, w in enumerate(words)]


def test_default_heuristic_compresses_without_any_model(tmp_path):
    # No session and no downloaded model → the real local heuristic runs (does NOT raise).
    comp = ClassifierCompressor(model_dir=tmp_path / "models")
    out, changes = comp.compress("the cat sat on the mat very quietly indeed", keep_ratio=0.5)
    assert out.split() != "the cat sat on the mat very quietly indeed".split()
    assert any(c.kind == "classifier_compress" for c in changes)


def test_heuristic_keeps_content_drops_function_words(tmp_path):
    comp = ClassifierCompressor(model_dir=tmp_path / "models")
    out, _ = comp.compress("the cat sat on the mat", keep_ratio=0.5)
    assert "cat" in out  # content word survives
    assert " on " not in f" {out} "  # a low-information function word is dropped


def test_heuristic_scorer_ranks_content_above_function():
    scorer = HeuristicImportanceScorer()
    the, cat, http, number = scorer.score(["the", "elephant", "HTTP", "2026"])
    assert the < cat  # function word < content word
    assert http > cat and number > cat  # acronyms and numbers score highest


def alpha_words(n):
    # Distinct lowercase words with NO digits (digits would trigger the always-keep rule).
    return [f"word{chr(97 + i)}" for i in range(n)]


def test_keep_ratio_respected():
    # 20 distinct lowercase words, single sentence (no punctuation) → only word 0 is force-kept.
    words = alpha_words(20)
    text = " ".join(words)
    comp = ClassifierCompressor(session=FakeSession())
    out, _ = comp.compress(text, keep_ratio=0.5)
    kept = out.split()
    ratio = len(kept) / len(words)
    assert abs(ratio - 0.5) <= 0.05


def test_code_fences_byte_identical():
    code = "```python\ndef f():\n    return 42\n```"
    text = f"please remove some of these fairly unimportant filler words here now {code} and more words"
    comp = ClassifierCompressor(session=FakeSession())
    out, _ = comp.compress(text, keep_ratio=0.4)
    assert code in out


def test_always_keeps_numbers_and_acronyms():
    text = "the value is 42 and the system uses HTTP and TCP for everything always here"
    # Force everything to lowest score so only the always-keep rule retains words.
    comp = ClassifierCompressor(session=FakeSession(score_fn=lambda w, i: 0.0))
    out, _ = comp.compress(text, keep_ratio=0.1)
    assert "42" in out
    assert "HTTP" in out
    assert "TCP" in out


def test_first_word_of_sentence_kept():
    text = "alpha beta gamma. delta epsilon zeta. eta theta iota."
    comp = ClassifierCompressor(session=FakeSession(score_fn=lambda w, i: 0.0))
    out, _ = comp.compress(text, keep_ratio=0.1)
    # First word of each sentence survives even at an aggressive ratio.
    assert "alpha" in out
    assert "delta" in out
    assert "eta" in out


def test_records_change_when_dropping():
    text = " ".join(alpha_words(20))
    comp = ClassifierCompressor(session=FakeSession())
    _, changes = comp.compress(text, keep_ratio=0.5)
    assert any(c.kind == "classifier_compress" for c in changes)


def test_sliding_window_merges(monkeypatch):
    import token_saver.compress.classifier as mod

    monkeypatch.setattr(mod, "_WINDOW", 5)
    monkeypatch.setattr(mod, "_STRIDE", 4)
    words = alpha_words(20)
    text = " ".join(words)
    comp = ClassifierCompressor(session=FakeSession())
    # Should not raise and should respect the ratio across windows.
    out, _ = comp.compress(text, keep_ratio=0.5)
    assert abs(len(out.split()) / len(words) - 0.5) <= 0.1
