# ST-236 frozen C6 independent security source review

Decision: **APPROVE security source only** for PR281 HEAD `1c4c7b0f30b13cfc572f23d4942d017dbda0569e`. This is not actual PG16, QA, CI, or merge approval.

## Correction to initial review

My initial P2 finding was mistaken and is withdrawn. I reproduced a quoted right-hand wildcard that does not appear in the committed C6 source. Exact `git show` at line 208 has unquoted `atomic-issue*` in the Bash `[[ ]]` expression; running that exact condition with `phase=atomic-issue-16` in Git Bash returns `MATCH`. The new timed-detail branch therefore covers `atomic-issue-01` through `atomic-issue-19`. No actionable security source issue remains from this review.

## Boundary assessment

The C6 diff against `859f5ef1fe675ea00ee1414bea6a3230f863c957` changes one SQL010 conflict arbiter and the two foundation proof shell files. `ON CONFLICT ON CONSTRAINT enrollment_intent_pkey` names the declared `(xid,verified_h)` primary key and avoids the PL/pgSQL parameter/column ambiguity without changing the arbiter or rights. No SQL010 role, grant, RLS, expiry, or service authority change appears in C6.

The reservation `reserve-first` seed is valid for 86400000 ms; the nonce `epoch` and `capacity` seeds use exactly 300000 ms. Only fixture owner updates target key `repeat('1',64)` after distinct holder/waiter PIDs and the exact expected blocked edge are observed. Each renewal uses one database-clock CTE and an owner transaction that requires one updated target, fresh future validity, and the same blocked edge before commit. The private returned expiry is observed with the same waiter blocked; existing release lower bound, COMMIT/ROLLBACK, final deletion, and snapshots of other rows remain. `prune-first`, `cross-prune`, settle, peek, and atomic-issue SQL semantics are unchanged. The SQL client uses `ON_ERROR_STOP=1`, so failed renewal assertions abort the proof.

The added `finish()` fields use fixed step/case/release/failure-kind allowlists and strict last-client SQLSTATE/decimal-exit parsing; the receipt adds no raw SQL, client error, row, timestamp, or identifier. The focused test injects private sentinels through the real writer for valid and invalid fields, including `atomic-issue-16`. Git diff whitespace check passed; I did not run actual PG16 or the full focused harness.

Whole-boundary qualification remains the private disposable PG16 fixture with only the pinned enrollment service and trusted simulator registered. The prior source-reviewed fixed intent/birth witness, server-derived dual owner GUCs, scoped identity/profile rights, nonce and burn transitions, and committed-before-disclosure terminal path have no C6 changes. Earlier C5 source approval is historical and does not override this C6 verdict. C1 early migration, C2 enrollment, C3 SQL010 42601, C4 prune, and C5 nonce-prune actual failures remain retained with their unknown first predicates where recorded. C6 actual PG16, actual QA, and exact-head applicable CI are pending. No default schema/module/provider/HTTP registration or production signup is accepted here.
