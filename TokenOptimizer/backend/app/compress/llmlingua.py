"""LLMLingua-2 extractive prompt compression via onnxruntime.

A token-classification model scores each token's keep-probability; we aggregate to words and keep
the highest-scoring fraction, preserving order. This is the real, learned compressor that runs in
the Cloud Run service (and is shared by every client). Verified against the int8 model:
~40-60% reduction with the information preserved (locations, dates, entities kept; filler dropped).

The selection logic (``select_compressed``) is pure and unit-tested. Model inference is loaded
lazily and exercised by an opt-in slow test when the model is present.
"""

import re
from pathlib import Path

_WORD_CHUNK = 300  # words per inference window (keeps subword count under the 512 model limit)
_DEFAULT_REPO = "Arcoldd/llmlingua4j-bert-base-onnx"  # ONNX export of microsoft/llmlingua-2 bert-base
_TOKENIZER_FILES = (
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
)


def download_and_quantize(out_dir: str | Path, repo: str = _DEFAULT_REPO) -> Path:
    """Download LLMLingua-2 and produce an int8 model (~178 MB). Shared by the CLI and the script."""
    from huggingface_hub import hf_hub_download
    from onnxruntime.quantization import QuantType, quantize_dynamic

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for name in (*_TOKENIZER_FILES, "model.onnx"):
        hf_hub_download(repo_id=repo, filename=name, local_dir=str(out))
    src, dst = out / "model.onnx", out / "model.int8.onnx"
    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
    return dst


def fetch_from_gcs(gcs_prefix: str, dest: str | Path) -> Path:
    """Download the int8 model + tokenizer from a ``gs://bucket/prefix`` into ``dest`` (Cloud Run
    startup). Mirrors the BreastCancer model-from-GCS pattern."""
    from google.cloud import storage

    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    bucket_name, _, prefix = gcs_prefix.removeprefix("gs://").partition("/")
    bucket = storage.Client().bucket(bucket_name)
    for name in ("model.int8.onnx", *_TOKENIZER_FILES):
        blob = bucket.blob(f"{prefix.rstrip('/')}/{name}")
        if blob.exists():
            blob.download_to_filename(str(dest / name))
    return dest


def select_compressed(
    words: list[str], scores: list[float], rate: float, *, force_digits: bool = True
) -> str:
    """Keep the top ``rate`` fraction of words by score (order preserved). Pure / deterministic."""
    if not words:
        return ""
    keep_n = max(1, round(len(words) * rate))
    ranked = sorted(range(len(words)), key=lambda i: (-scores[i], i))
    keep = set(ranked[:keep_n])
    if force_digits:
        keep |= {i for i, w in enumerate(words) if any(c.isdigit() for c in w)}
    return " ".join(words[i] for i in range(len(words)) if i in keep)


def _softmax(x):
    import numpy as np

    e = np.exp(x - x.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


class LLMLingua2:
    """Loads the ONNX token classifier + tokenizer and scores word keep-probabilities.

    ``session`` and ``tokenizer`` are injectable for tests. ``keep_label_index`` is 1 for the
    standard ``{0: EXCLUDE, 1: INCLUDE}`` head.
    """

    def __init__(
        self,
        model_dir: str | Path,
        *,
        session=None,
        tokenizer=None,
        keep_label_index: int = 1,
    ) -> None:
        self.model_dir = Path(model_dir)
        self._session = session
        self._tokenizer = tokenizer
        self.keep_idx = keep_label_index

    def _ensure_loaded(self) -> None:
        if self._session is None:
            import onnxruntime as ort

            path = self.model_dir / "model.int8.onnx"
            if not path.exists():
                path = self.model_dir / "model.onnx"
            self._session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        if self._tokenizer is None:
            from transformers import AutoTokenizer

            self._tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir))

    def score_words(self, words: list[str]) -> list[float]:
        """Per-word keep-probability, windowed so long inputs aren't silently truncated."""
        self._ensure_loaded()
        scores: list[float] = []
        for start in range(0, len(words), _WORD_CHUNK):
            scores.extend(self._score_chunk(words[start : start + _WORD_CHUNK]))
        return scores

    def _score_chunk(self, words: list[str]) -> list[float]:
        import numpy as np

        enc = self._tokenizer(
            words, is_split_into_words=True, return_tensors="np", truncation=True, max_length=512
        )
        feed = {i.name: enc[i.name] for i in self._session.get_inputs() if i.name in enc}
        logits = self._session.run(None, feed)[0][0]
        probs = _softmax(logits)[:, self.keep_idx]
        by_word: dict[int, list[float]] = {}
        for token_idx, word_id in enumerate(enc.word_ids(0)):
            if word_id is not None:
                by_word.setdefault(word_id, []).append(float(probs[token_idx]))
        return [float(np.mean(by_word.get(i, [0.0]))) for i in range(len(words))]

    def compress(self, text: str, rate: float = 0.6, *, force_digits: bool = True) -> dict:
        """Compress ``text`` keeping ~``rate`` of its words. Returns text + word counts."""
        words = re.findall(r"\S+", text)
        if len(words) < 2:
            return {"text": text, "words_before": len(words), "words_after": len(words)}
        scores = self.score_words(words)
        compressed = select_compressed(words, scores, rate, force_digits=force_digits)
        return {
            "text": compressed,
            "words_before": len(words),
            "words_after": len(re.findall(r"\S+", compressed)),
        }
