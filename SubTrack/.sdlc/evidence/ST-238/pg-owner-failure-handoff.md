# ST-238 C4 owner PG failure: bounded diagnostic handoff

The frozen C4 head `375f52b5e7b59b606f4dca8fcef7d0718f452617` and private run `38159921610` remain **FAILED / HOLD**. The natural profile browser portion passed, then the standalone PG integration failed in `SUBSCRIPTION_OWNER`. The published receipt identifies neither the failing owner predicate nor a SQL state. It does not establish a complete passing case or any ST-238 acceptance.

Canonical 0001 defines the household, member, subscription, and share fixture shape. Canonical 0002 retains runtime peer visibility through `subtrack_can_view_subscription` and owner-only update/negative predicates. 0004 adds FORCE RLS without replacing those policies. Static inspection did not prove a fixture, grant, query, or policy defect. No SQL, fixture, role, production auth, or assertion correction is proposed on C4 evidence alone.

The next source candidate adds closed diagnostic markers in `private-profile.integration.ts` and exports only a tightly anchored line from `private-profile-proof.sh`. The fixed substeps are:

- `SUBSCRIPTION_OWNER`: `household`, `member`, `subscription`, `share`, `peer_before`, `force`, `peer_after`, `detail_foreign`, `detail_missing`, `lock_foreign`, `lock_missing`.
- `SUBSCRIPTION_MODE`: `mode_incomplete`, `mode_choose`, `mode_reread`.
- `SUBSCRIPTION_CURSOR`: `cursor_insert`, `cursor_page`, `cursor_ties`.
- `SUBSCRIPTION_STATUS`: `status_lock`, `status_compare`, `status_readback`.

The only other fields are `class=ASSERTION|SQL` and `sqlstate=unavailable` or one validated uppercase five-character SQLSTATE from Prisma `meta.code` or a PG error bearing `severity` and `code`. Prisma's own `P2010`-style error code is not exported as a SQLSTATE. The reporter emits no error message, SQL text, row, UUID, credential, or full error metadata. The shell exporter accepts only exact phase/substep combinations and the same closed fields. Existing strict role, RLS, owner, peer, pagination, status, and fail-closed proof gates remain unchanged; no test is skipped.

The first new published predicate and SQLSTATE should drive a separate, reviewed correction if it proves a source defect. This instrumentation alone is not a PASS and needs an actual pinned PG/browser rerun followed by independent exact-head review. Original attempt-1 deadline `2026-10-11T20:41:13.258Z` and counters remain unchanged.
