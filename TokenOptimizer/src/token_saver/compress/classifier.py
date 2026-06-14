"""Local extractive compression — no API calls, and no required model download.

The default scorer is a real, deterministic **information-content heuristic**: function words
score low, content-bearing words (rare, long, numeric, capitalized, ALL-CAPS) score high. The
lowest-scoring words are dropped to hit the target keep-ratio. This is in the spirit of classic
extractive summarizers (tf-weighting + stopword removal) — it genuinely works offline.

For higher quality, an LLMLingua-2 ONNX classifier can be downloaded (``ensure_model`` /
``token-saver download-model``); when its files are present they are used instead of the
heuristic. The scoring backend is injectable, so tests run deterministically without any model.

Always kept regardless of score: text inside code fences / backticks (split exactly as the rule
compressor), the first word of each sentence, numbers, and ALL-CAPS acronyms.
"""

import re
import string
from pathlib import Path

from token_saver.compress.rule_compressor import _split_protected as split_protected
from token_saver.types import Change

DEFAULT_DIR = Path.home() / ".token-saver" / "models"
_WORD_RE = re.compile(r"\S+\s*")
_ACRONYM_RE = re.compile(r"[A-Z]{2,}")
_SENTENCE_END = (".", "!", "?")
_WINDOW = 350
_STRIDE = 256

# Common English function words — highly compressible, carry little task information.
_STOPWORDS = frozenset(
    """
    a an the this that these those and or but nor so yet for of to in on at by with from into onto
    over under again further then once here there all any both each few more most other some such
    is are was were be been being am do does did doing have has had having will would shall should
    can could may might must i you he she it we they me him her us them my your his its our their
    mine yours ours theirs as if while because although though since unless until about above below
    between against during before after up down out off than too very just also not no yes which who
    whom whose what when where why how it's i'm you're we're they're don't doesn't didn't can't won't
    """.split()
)


class HeuristicImportanceScorer:
    """Deterministic, offline keep-probability per word. The tested default backend."""

    def score(self, words: list[str]) -> list[float]:
        return [self._score(w, i) for i, w in enumerate(words)]

    @staticmethod
    def _score(word: str, index: int) -> float:
        clean = word.strip(string.punctuation)
        core = clean.lower()
        if not core:
            return 0.0
        s = 0.15 if core in _STOPWORDS else 0.55
        if any(c.isdigit() for c in word):
            s += 0.30
        if len(core) >= 8:
            s += 0.20
        if _ACRONYM_RE.fullmatch(clean):
            s += 0.30
        elif clean[:1].isupper() and index > 0:  # likely a proper noun mid-sentence
            s += 0.15
        return min(s, 1.0)


class ModelNotReady(Exception):
    """Raised only by explicit model operations — never by ``compress`` (which always works)."""


class ClassifierCompressor:
    def __init__(self, model_dir: Path = DEFAULT_DIR, session=None) -> None:
        self.model_dir = model_dir
        self._session = session

    def ensure_model(self) -> None:
        """Download the LLMLingua-2 ONNX export (optional quality upgrade over the heuristic)."""
        from huggingface_hub import snapshot_download

        self.model_dir.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
            local_dir=str(self.model_dir),
        )

    def _scorer(self):
        if self._session is not None:
            return self._session
        if (self.model_dir / "model.onnx").exists():
            try:
                self._session = _OnnxSession(self.model_dir)
                return self._session
            except Exception:  # corrupt/incompatible model → fall back, never crash
                pass
        self._session = HeuristicImportanceScorer()
        return self._session

    def compress(self, text: str, keep_ratio: float = 0.7) -> tuple[str, list[Change]]:
        out_parts: list[str] = []
        dropped = 0
        for is_code, seg in split_protected(text):
            if is_code:
                out_parts.append(seg)
                continue
            new_seg, seg_dropped = self._compress_segment(seg, keep_ratio)
            out_parts.append(new_seg)
            dropped += seg_dropped
        changes = (
            [Change("classifier_compress", f"dropped {dropped} low-information words", 0)]
            if dropped
            else []
        )
        return "".join(out_parts), changes

    def _compress_segment(self, segment: str, keep_ratio: float) -> tuple[str, int]:
        lead = re.match(r"\s*", segment).group()
        rest = segment[len(lead):]
        chunks = _WORD_RE.findall(rest)
        if not chunks:
            return segment, 0
        words = [c.strip() for c in chunks]

        scores = self._score_all(words)
        forced = _forced_indices(words)
        target = round(keep_ratio * len(words))

        selected = set(forced)
        ranked = sorted((i for i in range(len(words)) if i not in forced), key=lambda i: -scores[i])
        for i in ranked:
            if len(selected) >= target:
                break
            selected.add(i)

        kept = lead + "".join(chunks[i] for i in range(len(chunks)) if i in selected)
        return kept, len(chunks) - len(selected)

    def _score_all(self, words: list[str]) -> list[float]:
        scorer = self._scorer()
        n = len(words)
        if n <= _WINDOW:
            return list(scorer.score(words))
        scores = [float("-inf")] * n
        start = 0
        while start < n:
            end = min(start + _WINDOW, n)
            for j, s in enumerate(scorer.score(words[start:end])):
                scores[start + j] = max(scores[start + j], s)
            if end == n:
                break
            start += _STRIDE
        return scores


def _forced_indices(words: list[str]) -> set[int]:
    forced: set[int] = set()
    for i, word in enumerate(words):
        core = word.strip(string.punctuation)
        if i == 0 or words[i - 1].endswith(_SENTENCE_END):
            forced.add(i)
        if any(ch.isdigit() for ch in word):
            forced.add(i)
        if core and _ACRONYM_RE.fullmatch(core):
            forced.add(i)
    return forced


class _OnnxSession:
    """LLMLingua-2 token-classification via onnxruntime. Used only when the model is downloaded;
    exercised by the optional ``@pytest.mark.slow`` integration test."""

    def __init__(self, model_dir: Path) -> None:
        import onnxruntime
        from transformers import AutoTokenizer

        self.tokenizer = AutoTokenizer.from_pretrained(str(model_dir))
        self.session = onnxruntime.InferenceSession(str(model_dir / "model.onnx"))

    def score(self, words: list[str]) -> list[float]:
        enc = self.tokenizer(
            words,
            is_split_into_words=True,
            return_tensors="np",
            truncation=True,
            max_length=512,
        )
        feed = {k: v for k, v in enc.items() if k in {"input_ids", "attention_mask"}}
        logits = self.session.run(None, feed)[0]
        probs = _softmax(logits[0])[:, 1]  # keep-class probability per subword token
        # Aggregate subword probabilities up to whole words via word_ids alignment.
        word_ids = enc.word_ids(0)
        per_word: dict[int, float] = {}
        for token_idx, wid in enumerate(word_ids):
            if wid is None:
                continue
            per_word[wid] = max(per_word.get(wid, 0.0), float(probs[token_idx]))
        return [per_word.get(i, 0.5) for i in range(len(words))]


def _softmax(x):
    import numpy as np

    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)
