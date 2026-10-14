# ST249 storage platform plan review

2026-10-14. Final conditional PLAN GO for the disposable local/test storage source stream. Root must add the exact paths in `ST-248/st081-storage-final-handoff.md` to the ST249 task roster before source edits. No 017 SQL was executed in this review.

The amended candidate insert joins the same-owner account through its exact connection to the active, unpurged and synced Synthetic generation, and validates subscription account, currency, cadence, DETECTED source/status and privacy. One returned row is mandatory. The original review receipt stores the generated feedback UUID under a same-owner/candidate FK; Undo supersedes that exact event, not a coincident timestamp. Receipt uniqueness, consumed original and one-row updates retain the single compensating Undo invariant.

Every selected candidate amount must be a positive bigint no greater than signed int64 maximum before the first scan write. An unpersistable magnitude, including the absolute value of signed int64 minimum, rolls back the whole scan without conversion or truncation. The final synchronous trusted-clock Undo guard follows every awaited action/session/epoch step and token verification; only a confirmed pre-COMMIT rollback may surface known expiry as 409. Manual-only digest readback is additive to unchanged parent/bank proof because legitimate DETECTED rows change the all-subscription digest.

This GO authorizes reviewed source implementation only. Final source, privilege/NULL/FK/rollback PostgreSQL proof and installed native qualification remain separate gates. It makes no production retention, erasure or release claim.
