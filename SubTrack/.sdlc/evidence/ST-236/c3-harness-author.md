# ST-236 C3 harness author handoff

Scope: only the foundation proof harness and its shell negative harness changed. The accepted parent runtime `public.identity` DELETE grant is now asserted positively at the SQL010 writer ACL gate. The existing login, producer, and provisioner denial checks remain. No SQL, service, integration driver, fixture role, source pin, custody predicate, or time bound changed.

The `durable-enrollment` failure receipt now carries fixed `step` and `failure_kind` enums, a strictly bounded SQLSTATE (SQL010 only) or `unavailable`, and a decimal sidecar exit in 1–255 or `unavailable`. It distinguishes SQL010, writer ACL, bundle, driver creation, start, wait, exit, custody, and result. The sidecar's raw Docker logs remain private and are checked only against the fixed PASS line. The Node bundle's stdout/stderr is now captured in a private temp file, excluded from stdout and the receipt. The migration parser accepts `ERROR:  42P01`, `ERROR:  42P01 ...`, and `ERROR:  42P01: ...` while rejecting embedded, shortened, extended, and lowercase codes.

The shell negative harness exercises the real SQLSTATE parser and finish writer with no-colon, colon, malformed, embedded, and private-sentinel inputs. It also exercises the real finish writer for SQL010, sidecar exit 255, and invalid enrollment diagnostic fields; all expected receipts contain only bounded fields and no private sentinel.

Local Git Bash `bash -n` passed for both changed scripts and `git diff --check` passed. The complete shell negative suite cannot establish a pass on this Windows host because its real Linux private-file/chmod semantics are required. Actual PG16, CI, source review, and QA gates remain with the root/Conductor; no rerun or product acceptance is claimed here.
