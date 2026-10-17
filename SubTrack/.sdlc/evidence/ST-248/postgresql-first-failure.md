# ST248 first actual PostgreSQL run — failure

Reviewed source head: a9af0937870101de4e50ac01ffc33be5fa797028.
Workflow run38486982143, job115602881736 private-mobile-postgresql.

Actual result: FAILED. Frozen install, compiled bank runtime exports, API types and fixture descriptor custody all passed. Failure occurred inside the actual owned-PG16/TLS behavior step; emitted closed diagnostic:

`ST248_BANK_PROOF_FAILURE phase=TWO_OWNER`

The parent-first proof and bank connect/sync/dedup/restart reached the authenticated second-owner phase. This does not establish completion of the second-owner or later bank acceptance steps. Public diagnostics do not identify the exact substep or exception category. The run publishes zero artifacts, so no retained private failed log/config/rows are available for further precise diagnosis. Do not infer a SQL/model failure from the coarse phase alone.

Closed cleanup log confirms `ST244_FIXTURE_CLEANUP removed`. No success receipt or accepted native/PG completion is claimed.

Source/schema inspection found no proven concrete cause. The authored Bob profile Unicode escape has exactly one JavaScript backslash and is valid, so no emoji repair is warranted.

Smallest justified next delta: reviewed closed TWO_OWNER substep and exception-category observation within owned fixture RAM, preserving all existing assertions and production error masking. Only exact known SQLSTATE mapping and AssertionError classification; unknowns mapOTHER. No messages/detail/hint/query/parameters/rows/claims/headers/URLs or raw exceptions may be emitted/retained as diagnostics. Pending independent privacy plan/source GO; no unchanged rerun or source/model/grant change performed for this diagnosis.
