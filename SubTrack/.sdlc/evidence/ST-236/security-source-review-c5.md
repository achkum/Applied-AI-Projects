# ST-236 frozen C5 security source review
Decision: **APPROVE security source only** at PR281 HEAD `859f5ef1fe675ea00ee1414bea6a3230f863c957`; actual C5 PG16, QA, and exact-head CI remain pending.
Relative to C4 `94bf5b7`, executable changes are confined to the two allowed foundation proof shell scripts: allowlisted prune checkpoint, direction, outcome, and failure-kind fields plus focused real-`finish()` privacy negatives.
The prune receipt reads strict five-character uppercase alphanumeric SQLSTATE and bounded decimal exit from the last private client before cleanup; its `last_client_*` names and source comment do not attribute an assertion to that client.
`finish()` validates every new outward field against fixed allowlists, emits no private log/error/SQL/row/identifier value, and retains fixture/client cleanup and custody checks.
The diff keeps all prune SQL and assertions, the 5000 ms reservation expiry, lock/timeout bounds, pins, roles, grants, policies, service, and SQL010 unchanged. It adds no authority path.
The synthetic cases cover valid, unavailable, invalid step/enum/SQLSTATE/exit values and private-sentinel nondisclosure through the real receipt writer; source review does not certify their execution here.
C1–C4 actual failures remain recorded; C4 failed at prune before SQL010/driver, so it supplies no enrollment result. Fresh exact-head actual PG16, independent QA, applicable CI, and Conductor gates remain required. No signup, usable HTTP enrollment, or global deletion/refresh race claim follows.
