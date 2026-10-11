# ST-236 frozen C7 PLATFORM source review

- **APPROVE source only** at PR281 HEAD `70dd6b09c4e6ab61fc754d9036a700bea8799c36` versus C6 `1c4c7b0f30b13cfc572f23d4942d017dbda0569e`; actual PG16, QA, CI and merge remain separate.
- Read `AGENTS.md`, ST-236 task/C7 GO, Constitution, C6 platform source approval and atomic diagnosis. C7 executable delta is confined to the two authorized proof scripts; `git diff --check` passed.
- `atomic-issue-02` maps its original nine faults to fixed labels; `atomic-issue-03` maps six original parents to fixed labels. Operation, SQLSTATE, rollback and catalog assertion steps identify the failing checkpoint without exposing fault SQL.
- Installer status is captured immediately after the guard client, before subsequent owner assertions overwrite the last-client log. `finish()` emits only fixed step/case/release/failure/drift labels, five-character uppercase alphanumeric SQLSTATE or unavailable, and decimal exit 1–255 or unavailable.
- `snapshot_gn_catalog` computes the original whole hash and a diagnostic hash in one database statement. The logical projection changes only the `pg_class` element, removing `relpages`, `reltuples`, `relallvisible`, `relfrozenxid`, `relminmxid`; all other catalog arrays remain in the whole and logical hashes.
- Each guarded fault still requires installer failure, SQLSTATE `22012`, rollback absence and exact **whole-catalog** equality. A physical-only, logical or unavailable diagnostic never permits continuation on whole-hash mismatch.
- Real `finish()` writer fixtures cover all nine fault labels, all six parent labels, both atomic phases, drift classes, malformed fields and a private sentinel. The receipt tests reject raw SQL, rows, times and IDs; no hash or catalog JSON enters the receipt.
- The C6 private SQL/service boundary remains source-approved and unchanged by this delta. No expiry, custody, grant, feature SQL, timeout, or activation change was found. The withdrawn C6 quoted-wildcard claim is not reinstated.
- **Actual HOLD:** C6 PG16 failed at atomic-issue-02 without a localized first predicate. C7 PG16/Node enrollment, exact-head QA and applicable CI are pending; all C1–C6 failures remain historical evidence, with no flake or cause claim.
- Original 09:44:30.897Z L240 attempt 1/source attempt 1, 13:44:30.897Z deadline and 4700/5000 caps remain unchanged.
