# ST-237 exact tuple and source-pin audit

Read-only audit at accepted `fd380a353e11441cf294856a7df474da53421a57`, 2026-10-11. This is a plan, not source GO or an executed PG/browser proof. Only this file is mine.

## Frozen tuples

| Database | Origin | runtime login | active epoch | manifest |
| --- | --- | --- | --- | --- |
| `st233a_development_auth_foundation_proof` | `https://st233a.invalid` | `subtrack_dev_auth_login` | `fixture` | `a` repeated 64 |
| `st237_private_https_profile` | `https://localhost:3443` | `subtrack_dev_auth_login` | `st237_private_https_v1` | `b` repeated 64 |

Keep `SESSION_USER = 'st233a_fixture_owner'` for SQL installation, distinct from runtime login. Retain `public.st233a_fixture_control`, task `ST-233a`, `st233a.head` and `st233a.marker` exact-head/fresh-marker guards for both disposable databases. SQL001 requires the four auth roles to be absent before install. Roles are cluster-wide, so the private database needs its own disposable PG16 cluster/container if the old fixture is retained. A second database in the same cluster conflicts; do not weaken this guard or add memberships, roles, or allowlists.

For every SQL Origin guard use one exact `CASE pg_catalog.current_database() WHEN 'st233a_development_auth_foundation_proof' THEN 'https://st233a.invalid' WHEN 'st237_private_https_profile' THEN 'https://localhost:3443' ELSE NULL END`, and an explicit two-database installer guard. Never use an independent `origin IN (...)`. Pair database, Origin, active epoch and manifest in each trusted runtime constructor/startup check. Keep SQL's existing epoch-row active/manifest/Origin comparisons. Do not make every epoch table row use one literal ID or manifest: the old proof intentionally seeds auxiliary `retired`, `parallel`, `reserve-a`, etc., and mutates manifest to test failure. The private startup must prove the immutable key set corresponds to its frozen manifest; format-only hex checks cannot establish this. With literal `b`×64, a cryptographic fingerprint of arbitrary keys cannot simply be assumed: define a verifiable custody mapping or revise the identifier through review before GO.

## Per-file SQL map

All ten files `apps/api/prisma/development-auth/001`–`010` have the old DB installer guard. SQL001 uses `\gset`/division; 002–010 divide directly. Preserve PG16, installer `SESSION_USER`, control head/marker, roles/catalog/ACL and prior-object predicates while adding the exact second DB. Preserve old constraint names where the original proof drops them by name.

| SQL | Exact old-Origin sites and minimum edit |
| --- | --- |
| 001 | `epoch.origin` and `nonce.origin` typed CHECKs at lines 36/58: database-paired Origin. Existing nonce `(epoch,origin)` FK stays. |
| 002 | `fence` has no Origin literal. It checks active epoch/manifest/watermark; runtime DB/Origin/epoch pin must surround it. |
| 003 | `peek` line 57: database-paired Origin; keep epoch/manifest/nonce comparisons. |
| 004 | `reserve_bootstrap` line 64: database-paired Origin; keep owned burn/epoch comparison. |
| 005 | `prune_reservations` line 69: database-paired stored epoch Origin; keep state/manifest/time checks. |
| 006 | `settle_bootstrap` line 63: database-paired Origin; keep owned burn equality. |
| 007 | `prune_nonces` line 74: database-paired stored epoch Origin; keep state/manifest/time checks. |
| 008 | `issue_bootstrap_nonce` line 71: database-paired Origin; keep nonce/reservation witness. |
| 009 | `session.origin` typed CHECK line 55 and `check_current_web` line 195: database-paired Origin. Existing session `(epoch,origin)` FK stays. `replace_current_csrf` and `revoke_current` rely on this check. |
| 010 | Typed `otp`, `restricted_proof`, `pending_enrollment`, `verified_enrollment` Origin CHECKs lines 72/82/91/106; callable predicates `enrollment_checked_ms` 206, `reserve_enrollment` 243, `fail_enrollment_burn` 659, `prune_enrollment` 692: database-paired Origin. Preserve checked scope/epoch/nonce/burn joins. |

The `REVOKE ... st233a_fixture_owner` clauses throughout and SQL009's narrow `issue_fixture` grant to that owner are intentional ACL semantics. Keep them, the existing role/membership graph, table RLS, and default privilege negatives. The new ordinary business migration and Prisma mapping must mirror SQL010 business schema separately from qualified fixture install; never stack the ordinary migration on SQL010 or make fixture SQL idempotent.

## TypeScript and composition map

`apps/api/src/auth/browser-nonce/development-bootstrap-postgres-port.ts` constructor lines 47–50 currently checks old Origin/DB and generic nonempty epoch/64-hex manifest. Replace with one exact complete tuple predicate; retain fixed `subtrack_dev_auth_login`, loopback PG, SCRAM password shape, ambient-PG rejection and burn/nonce witness equality. Its connection currently validates role and empty GUCs but needs `current_database()`, `session_user` and selected tuple checked at connection as well. A caller database string is not authority.

`development-bootstrap-material.ts`, `development-bootstrap-transaction.ts`, and `development-bootstrap-burn-material.ts` are generic HTTPS/form and witness-equality producers. Keep reusable internals; private composition must select one frozen tuple and pass it consistently to all three, with no HTTP-supplied origin/epoch/manifest. `durable-development-enrollment.ts` constants `ORIGIN`/`DATABASE` and constructor line 88 need exact tuple selection including epoch/manifest. Its `CLEAN` query already selects DB and checks login/empty dual GUCs; compare the selected literal DB. `durable-current-web-authority.ts` constructor line 76 pins only old Origin and accepts generic epoch/manifest; add complete tuple check. Its `CLEAN_SQL` does **not** select DB; add `current_database()` and verify it on every borrowed connection, before and after transactions, retaining login/current-user/dual-GUC reset. Preserve current token/binding/CSRF pre/post checks, static trusted business SQL, owner lock and runtime role. `durable-current-web-fixture.ts` hard-pins the historical Origin/role as proof glue; preserve its old proof or add a separately pinned private fixture variant.

`v2-web-session-binding.ts`, `durable-session-csrf.ts`, `v2-access-token.ts` contain no old DB/Origin literal. Their hashes/JWT verify no DB/epoch/manifest by themselves. Private composition must verify a matched Ed25519 key pair, separate mandatory >=256-bit keys, their frozen manifest/custody binding, schema and tuple before opening HTTPS. Keep v2 signing namespace isolated. No default app listener or competing writer is authorized by these primitives.

## Installer, exact pins, negatives

`tools/database/development-auth-foundation-proof.sh` has a 34-input source graph (`inputs` lines 324–331). It checks each file's Git blob against `source_head:path`, records blob and SHA-256, checks exact catalog/ACL/function body, then rechecks source at finish (lines 1966–1967). `test-development-auth-foundation-proof.sh` checks its cleanup/receipts. The old harness hardcodes old DB/Origin/epoch/manifest in many cases. Do not repoint it or replace old expectations with private values. Changed SQL function bodies/constraints alter its exact digest assertions; update only the necessary expected old definitions at the changed head, rerun the complete old positive/negative proof and cleanup self-test. Blind substitutions can destroy the historical proof.

Add separate `tools/database/st237-private-https-profile-proof.sh` and `tools/database/test-st237-private-https-profile-proof.sh` (proposed names), with any necessary private `apps/api/test/` integration harness. Own a new PG16 cluster/container, install ordinary 0001→0002 base, qualified SQL001→010, seed only the new active tuple, and retain the accepted actor/installer roles. Run the new ordinary forward business migration in a **separate ordinary database path**. Pin every installer, SQL, source, composition and test input to exact Git blob plus SHA-256 at `source_head`; pin generated driver bundle checksum and assert `current_database()`, constraint/function source, ACL, RLS and grants. Recheck pins at finish. Sanitize receipt to head, tuple identifier, result, container ownership, removal and key/secret destruction. Test failing/interrupted cleanup without touching unowned resources.

Negative matrix: old DB/new Origin; new DB/old Origin; old DB/new epoch or manifest; new DB/old epoch or manifest; either Origin with cross epoch/manifest; arbitrary DB/Origin; modified/retired active epoch; wrong installer `SESSION_USER`; wrong actor or extra membership; owner/provisioner/direct table/function access; absent/half-set/cross-owner dual GUCs; pooled role/GUC residue. Exercise typed-table INSERT/UPDATE and callable fence, nonce/burn, current-web and enrollment paths, not just constructor rejection. Verify `current_database()` for every runtime connection and startup writer graph (legacy/refresh/delete/revocation absent) before accepting a request. Keep all original old-tuple negative tests and exact receipt/cleanup behavior.
