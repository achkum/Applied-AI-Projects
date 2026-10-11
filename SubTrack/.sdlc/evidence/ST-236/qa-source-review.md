# ST-236 frozen C2 QA source review — READY FOR ACTUAL PG16
Exact PR281 HEAD `7118c1fd6a85276c51090427cfa045d98c580e14`; independent source review only, no PG16 or CI acceptance claim.
C1 P1 corrected: SQL010 birth remains `(identity_id,xid)`; catalog asserts that shape and expiry seed uses linked `enrollment_intent`, then checks both sidecars pruned.
Integration executes runtime and executor identity reads: own row 1, foreign row 0, mismatched dual GUC row 0; direct login/role denials and ACL/RLS/trigger catalog checks remain.
Actual-service path covers bootstrap→OTP→restricted proof→pending→trusted simulator→atomic account/profile/session/CSRF, then signed ST-235 current-web owner callback, stored binding and refresh digest.
Source preserves fifth committed wrong-code exhaustion, global burns, races, epoch/clock/expiry/capacity, rollback, unknown-commit nondisclosure, fresh-process same-key denial, old-UUID rejection and sidecar/pool cleanup.
Harness readiness probes TCP 127.0.0.1 like psql; migration failure receipt exposes only fixed substep, strict SQLSTATE and bounded exit status. Real parser/finish negatives check private sentinel exclusion; custody/pins remain.
C1 actual foundation failure at migration before SQL010 remains unexplained and retained; this review does not relabel it a flake. C2 exact-head PG16 and applicable CI must pass before QA acceptance.
Qualified disposable writers only; no default migration, HTTP signup, real provider, delivery, production or deletion-race acceptance.
