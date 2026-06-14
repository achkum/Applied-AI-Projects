"""Delta-encode resent files: when the same file is sent again, send a unified diff, not the file.

CRITICAL invariant: the store always holds the latest FULL text of each key, never a diff. So a
third send diffs against the second version, not the first. LRU-bounded by file key.
"""

import difflib
from collections import OrderedDict

from token_saver.tokens import count_tokens
from token_saver.types import Change

_DIFF_RATIO = 0.6  # use the diff only if it is < 60% of the full text's tokens


class DeltaStore:
    def __init__(self, max_files: int = 200) -> None:
        self._max_files = max_files
        self._store: OrderedDict[str, str] = OrderedDict()

    def process(self, key: str, text: str, model: str) -> tuple[str, Change | None]:
        """Return (payload, change). First sight stores and returns text unchanged (change=None).

        On a resend, compute a unified diff against the stored full text; if the diff is small
        enough, return it, otherwise return the full text. Either way the store is updated to the
        NEW full text.
        """
        if key not in self._store:
            self._remember(key, text)
            return text, None

        previous = self._store[key]
        diff = "".join(
            difflib.unified_diff(
                previous.splitlines(keepends=True),
                text.splitlines(keepends=True),
                fromfile=key,
                tofile=key,
            )
        )
        # Always advance the store to the new full text — never store a diff.
        self._remember(key, text)

        full_tokens = count_tokens(text, model).count
        diff_tokens = count_tokens(diff, model).count
        if diff_tokens < _DIFF_RATIO * full_tokens:
            payload = f"[delta vs previously sent {key}]\n{diff}"
            saved = full_tokens - count_tokens(payload, model).count
            change = Change(
                kind="delta_encode",
                description=f"sent unified diff vs previous {key}",
                tokens_saved=saved,
            )
            return payload, change
        return text, None

    def _remember(self, key: str, text: str) -> None:
        self._store[key] = text
        self._store.move_to_end(key)
        while len(self._store) > self._max_files:
            self._store.popitem(last=False)
