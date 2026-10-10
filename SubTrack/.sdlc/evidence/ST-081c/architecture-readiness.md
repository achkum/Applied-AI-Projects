# Next storage slice: private ordinary lifecycle writer
Goal: a small internal repository operation for UF-08 owner actions only; no route, module registration, UI, provider, or persistent database.
Scope: ACTIVE pause/cancel/archive; PAUSED resume/cancel/archive; CANCELLED archive. Use the accepted ST-081a decision table; reject all other pairs.
Allowed implementation paths for a new task: `apps/api/src/subscriptions/**`, focused `apps/api/test/**`, dedicated PG proof/CI files, and that task/evidence; name exact files before dispatch.
Prerequisites: BUG-008b migration and ST-212 scoped reads accepted on main; ST-213 acceptance only if its local composition is reused.
Derive `RequestContext.userId` solely from the accepted trusted principal; use `withRequestTransaction` with both identical transaction-local GUCs.
Lock the identified row inside that transaction; require `identity_id = principal`, apply the lifecycle decision to the locked current status, then update conditionally and return only bounded status data.
Serialize competing writes in PostgreSQL; a second stale action must conflict or evaluate against the new locked status. Rollback leaves no partial state.
No review confirm/reject/edit/merge, undo, feedback, idempotency receipt, audit payload, new status creation, or lifecycle automation in this slice.
Actual disposable PG16 tests: ordinary nonowner LOGIN, full reconciled migrations, synthetic fixtures, owner success, unrelated/peer/share/open_book/always-private denials, same-row race, conflict, rollback, and pooled context cleanup.
Unit tests cover exact allowed transitions and error mapping; verify API lint/typecheck/regression and independent platform/security/QA source and PG proof before merge.
Block persistence if approved policy requires audit or replay receipts for these ordinary actions: first resolve their minimum fields, retention/erasure and schema/RLS contract with security review.
Do not treat this as ST-081 or UF-06 completion; the accepted review receipt/feedback purpose, deletion and retention gaps remain separate gates.
