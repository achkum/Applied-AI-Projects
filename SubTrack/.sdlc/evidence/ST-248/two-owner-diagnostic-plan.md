# ST248 TWO_OWNER diagnostics frozen plan

Actual run38486982143/a9af093 failed at TWO_OWNER, cleanupremoved, no retained artifact. No concrete implementation cause is established. This delta changes failure diagnostics only; all existing assertions, SQL/auth/profile/bank model/grants and parent-first execution remain.

Owned paths: apps/api/test/private-mobile-bank-diagnostics.ts and adjacent.spec.ts; existing private-mobile-owned-fixture.ts, private-mobile-bank-proof.ts/integration.ts, tools/database/private-mobile-bank-qualify.sh; task/evidence wildcard already covers every path. No production API/authority/contract change.

Exact step enum (set immediately before the named existing operation/assertions):

A_SNAPSHOT, B_SESSION, B_DISTINCT, B_PROFILE_GATE, B_PROFILE_PATCH, B_MODE, B_EMPTY_READ, PUBLIC_SELECTOR, B_EMPTY_SNAPSHOT, B_TO_A_SYNC, B_TO_A_SYNC_SNAPSHOT, B_TO_A_RETAIN, B_TO_A_RETAIN_SNAPSHOT, B_TO_A_PURGE, B_TO_A_PURGE_SNAPSHOT, B_CONNECT, B_SYNC, B_POSITIVE_READ, A_POSITIVE_READ, B_POSITIVE_SNAPSHOT, A_TO_B_SYNC, A_TO_B_SYNC_SNAPSHOT, A_TO_B_RETAIN, A_TO_B_RETAIN_SNAPSHOT, A_TO_B_PURGE, A_TO_B_PURGE_SNAPSHOT, B_PURGE, B_EMPTY_AFTER_PURGE, B_LOGOUT, B_LOGOUT_DENIED, A_FINAL_SNAPSHOT, TWO_OWNER_COUNTS.

Exact SQLSTATE projection:

42501=>PERMISSION;42703=>UNDEFINED_COLUMN;42P01=>UNDEFINED_TABLE;23503=>FOREIGN_KEY;23505=>UNIQUE;23514=>CHECK;23502=>NOT_NULL;42804=>TYPE_MISMATCH;22P02=>INVALID_INPUT;22003=>NUMERIC_RANGE;40001=>SERIALIZATION;40P01=>DEADLOCK.

Other categories: ASSERTION only for an actual node:assert AssertionError; OTHER for unrecognized terminal exceptions. Unknown codes, code accessors/proxies and non-error payloads never produce arbitrary labels or invoke payload getters. No raw exception/message/detail/hint/query/params/results/rows/claims/headers/URLs are retained or emitted. The map uses only own data-property code from actual Error instances.

Owned fixture actorPool existing query wrapper captures the current immutable step frame before query execution. On rejection it records only the first recognized SQL category in that same current frame, then rethrows the original object unchanged. Unknown SQL codes are not retained; an unrecognized terminal outer error mapsOTHER. No query text/values/result inspection or retention, retry, timing change, query argument/result/rejection change, or production authority masking change.

Diagnostic tracker activates only after the current owned graph starts. A typed/runtime-validated step reset creates a fresh opaque frame/generation and clears category. Stop/restart/dispose invalidates/clears frame and category; a callback captured under an old frame/graph cannot record in a new frame. Capture is nonthrowing and inactive outside TWO_OWNER. Begin requires the current graph and development environment. After TWO_OWNER success, disable/clear tracking. No HTTP registration or new telemetry callback.

Failure output grammar:

ST248_BANK_PROOF_FAILURE phase=TWO_OWNER step=<exact32step enum> category=<exact12SQLenum|ASSERTION|OTHER>

Every other proof phase retains its existing closed legacy failure line. Missing/unknown step/category cannot emit expanded output. Emission occurs only in the existing failed proof catch; no successful-step progress log is added. Shell validator must use the exact anchored enum grammar, not a generic suffix, and reject private canaries/unknowns/trailing text. Cleanup and success receipt behavior remain.

Focused validation: category-map positives, actual AssertionError versus fake/nonerror, unknown/private canary/getter rejection, exact safe grammar, current-step first category/reset, inactive tracking, graph restart/disposal/late callback fence, and same query error propagation. Typecheck/lint/shell syntax; no unchanged implementation or hosted/native rerun before independent final source GO.
