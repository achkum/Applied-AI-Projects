# SEC-FU1c — Proposed internal JWT HTTP principal integration

**Disposition:** Proposed bounded implementation contract; not yet a task/backlog entry and not an auth-readiness or deployment approval. Source review only; no runtime code or database was changed.

## Readiness basis

- `SEC-FU1a` and `SEC-FU1b` are DONE and their accepted implementation receipts establish the existing EdDSA JWT verifier and pure `PrincipalResolver`. The resolver verifies before reading, supplies only verified `claims.sub` as the lookup `RequestContext.userId`, rejects stale/revoked/deleted/mismatched snapshots generically, and returns a frozen `{ identityId, sessionId }`. Both tasks explicitly withheld HTTP transport, storage adapter, transaction integration, module registration, and live RLS claims.
- `request-transaction.ts` starts a Prisma transaction and sets both `app.user_id` and `app.current_user_id` with transaction-local `set_config(..., true)` before its callback. Migration policies for `identity` and `session` use `app.current_user_id`. Existing `api.spec.ts` checks binding order and transaction-local calls only with mocks; it is not PostgreSQL/RLS evidence.
- Prisma `Identity` and `Session` models map the already accepted `0001_identity_household_rls` and `0003_session` objects. `Identity.id` and `Session.id` are UUID columns; `Session.identityId` is an FK; `Session` has `revokedAt`; `Identity` has `deletedAt`. The UUID cast in RLS means a non-UUID signed `sub` may make PostgreSQL reject the lookup; preserve SEC-FU1b's opaque-ID JWT contract and map this reader failure to generic 401 rather than adding transport UUID validation.
- `BUG-008` remains BLOCKED because it found incompatible duplicate `0002` subscription definitions and has no authoritative inventories for other databases. Its last recorded local Compose inventory (2026-10-04) had no app relations or `_prisma_migrations`; that is not a current or external database-state guarantee. This does not authorize migration repair or use of any existing database as a proof environment.
- `BUG-009` confirms exact Prisma parity for `0003_session` but expressly bars importing/registering Auth/Sessions modules until separately reviewed principal binding and database request-context evidence exists.
- Branch/PR reconciliation (read-only): current checkout is `st/ST-050b-registration-hardening`; no SEC-FU1c branch exists. Local refs are `main`, `st/ST-050b-registration-hardening`, and `st/ST-206-deployment-images`. The only open PR returned by `gh pr list` is PR #220 from ST-050b to the ST-206 branch and is unrelated to this candidate. The working tree is shared and dirty: `ST-051d.md`, mobile registration/root-index files, `ST-081b.md`/`ST081b` evidence, and domain detection files/coverage were present during the final status check; these unrelated changes were not touched. Do not base or overwrite this task against PR #220.

## Proposed task header

```yaml
id: SEC-FU1c
title: Attach verified existing-JWT principals to internal HTTP requests
type: task
milestone: M1
owner_role: dev-backend
reviewers: [architect-platform, security-privacy, qa-engineer, conductor]
size: M
depends_on: [SEC-FU1b]
status: PROPOSED
allowed_paths:
  - SubTrack/apps/api/src/auth/sessions/authenticated-principal.guard.ts
  - SubTrack/apps/api/src/auth/sessions/authenticated-principal.guard.spec.ts
  - SubTrack/apps/api/src/auth/sessions/prisma-session-owner-reader.ts
  - SubTrack/apps/api/src/auth/sessions/prisma-session-owner-reader.spec.ts
  - SubTrack/apps/api/test/authenticated-principal-http.spec.ts
  - SubTrack/apps/api/test/prisma-session-owner-reader-postgres.spec.ts
  - SubTrack/.sdlc/tasks/SEC-FU1c.md
  - SubTrack/.sdlc/evidence/SEC-FU1c/**
```

Paths are a proposal, not permission to add/remove files after task adoption without updating the task contract. No module file is proposed: instantiate the guard/reader in a test-only Nest module and defer reusable production provider wiring until a real contracted consumer exists.

## Goal and scope

Implement an internal Nest `CanActivate` guard for exactly one existing `Authorization: Bearer <JWT>` credential, attach a freshly frozen verified principal and a freshly frozen `RequestContext({ userId: principal.identityId })`, and provide the minimal read-only Prisma `SessionOwnerReader` needed by the accepted resolver. Exercise the guard through a test-only HTTP probe and prove the storage reader against a disposable PostgreSQL database as a non-bypass, non-owner application role. The task creates no production route and no default module activation.

### Transport and request attachment contract

- Inspect raw HTTP header pairs case-insensitively so the guard can count `Authorization` fields before framework coalescing. Require exactly one field and exactly one bearer credential. Accept the Bearer scheme case-insensitively with ordinary HTTP optional whitespace; reject missing, duplicate (including duplicate equal values), blank, comma-joined, malformed, or unsupported schemes. Pass only the extracted token to the existing `PrincipalResolver`; no V2 token, cookie, refresh credential, `X-Caller-Id`, query, or body input is an authority.
- On success attach only the resolver's frozen `{ identityId, sessionId }` and a new frozen `RequestContext` whose sole `userId` is that principal's `identityId`. Neither value is copied from request input. Downstream data access still has to call `withRequestTransaction` with this context; the guard does not wrap the whole HTTP handler in a transaction.
- Every header parse, JWT verification, snapshot/ownership, RLS cast, or reader/database failure produces the same `UnauthorizedException('Unauthorized')` / Nest 401 shape. Do not expose the token, IDs, database errors, causes, ownership details, or PII in the response or logs. Avoid adding logging in the guard/reader.

### Reader and query contract

- `PrismaSessionOwnerReader` implements the existing `SessionOwnerReader`; its only inputs are `sessionId` and `Readonly<RequestContext>`. It uses `withRequestTransaction(prisma, context, ...)` and never reads request headers/body or unscoped Prisma models.
- Run one parameterized, read-only SQL statement through the transaction client to select only session `id`, `identity_id`, `revoked_at` and joined identity `id`, `deleted_at`, with predicates for both the signed session ID and `session.identity_id = context.userId`. The join must keep the two-row snapshot in one PostgreSQL statement/snapshot, and PostgreSQL RLS must independently scope both tables. Do not use Prisma relation loading whose query count/snapshot behavior is implicit.
- Map zero rows to `null`, exactly one row to the existing `CurrentSessionOwnerSnapshot`, and any impossible multiplicity or malformed result to an error that the resolver masks. The session primary key and identity primary key make the result cardinality at most one. Keep revoked/deleted timestamps in the result so the already accepted resolver makes those decisions. Do not introduce owner, household, membership, status, cache, or fallback lookup logic.
- A single reader call owns one short transaction around GUC setup and the one snapshot query. The guard/resolver must not keep it open through controller execution. Each later protected repository operation will need its own verified context and appropriately scoped transaction.

### Tests and proof gates

- Guard unit tests and test-only Nest HTTP tests cover missing, repeated, malformed, comma-joined, and non-Bearer fields; invalid JWT causes zero reader calls; resolver success attaches only the frozen principal and derived context; storage/ownership failures match the same generic 401 body; spoofed `X-Caller-Id` and body `identityId` are ignored; no credential or ID reaches logs/snapshots. Preserve an existing-JwtService issue/verify integration case or reuse the accepted resolver integration coverage rather than implementing a second verifier.
- Reader unit tests cover exact trusted arguments, parameterized session/user scope, one statement, read-only transaction use, 0/1/>1 row handling, generic error behavior, and transaction closure. Do not rely on mock transaction tests as live policy evidence.
- PostgreSQL proof uses a dedicated disposable database/container, applies only the already accepted `0001_identity_household_rls` and `0003_session` SQL needed by these two models, and does not invoke Prisma migrate, alter repository migrations, or depend on resolving the duplicate `0002` history. Seed fixtures via a setup/owner connection; run application reads through a separate role that is `NOBYPASSRLS`, is neither superuser nor table owner, and has only required SELECT permission. Record role flags, `relrowsecurity`, relevant policy names/definition hashes or safe policy summaries, database/schema identity, command exit status and test assertions without credentials or business-row dumps.
- The live test proves same-owner active session+identity resolve; another identity's session is invisible under the signed owner's context; absent session returns no snapshot; revoked session returns revoked state for resolver rejection; deleted identity returns deleted state for resolver rejection; malformed UUID-scoped user input fails closed and the resolver maps it to generic 401; both GUCs are transaction-local; after a request for owner A, a distinct transaction/request for owner B does not inherit A's `current_user_id`; and the app role does not bypass RLS. Include transaction rollback/closure evidence and never query or write an existing dev/staging/production database.
- Focused guard/reader suites, meaningful API regression suite, API lint/typecheck, reader/guard changed-source coverage with explicit security branch cases, independent architect-platform and security-privacy source reviews, QA review, and exact-head required CI are gates before merge. Do not claim all HTTP routes are authenticated, full RLS correctness, deployability, or security all-clear.

## Explicit exclusions

No `AppModule`, `AuthModule`, `SessionsModule`, or production module registration; no route/controller/probe endpoint in the app graph; no OpenAPI/public API changes; no legacy controller repair or removal of `X-Caller-Id`; no auth issuance/refresh/logout/deletion policy, browser cookie/CSRF, BankID/OTP, key provisioning/rotation, new dependency, schema/model/migration/policy change, database apply/repair/reset, or production deployment. Keep any probe controller test-only. The unrelated ST-051d working-tree change and PR #220 are out of scope.

## Root architecture decisions to record before author dispatch

1. **Request attachment boundary (Type 2b):** adopt the recommendation to attach only the frozen resolver principal plus a frozen one-field context derived from `principal.identityId`; prohibit ambient context/provider state.
2. **Transaction boundary (Type 2a if broadened):** accept one reader-owned `withRequestTransaction` around one joined SQL statement; do not promise one transaction across guard and future handler. Decide any route-wide transaction only with the first real consumer.
3. **Credential grammar (Type 2b):** use exactly one raw Authorization field, one Bearer credential, and existing `JwtService` profile; no V2/cookie fallback.
4. **Module boundary (Type 2b):** no production module/provider registration in SEC-FU1c. Test-only Nest module may bind the providers; first actual consumer owns production provider wiring in a separately reviewed task.
5. **Disposable database tool (readiness prerequisite):** provide a reproducible local/container PostgreSQL test command and a way for the harness to create a temporary database, a setup owner, and a distinct `NOBYPASSRLS` non-owner test role without placing credentials in logs or the repository. Verify this in preflight before author dispatch. If that tool/role proof is unavailable, dispatch a guard-only implementation task and keep `PrismaSessionOwnerReader`/live RLS evidence as a separately blocked follow-up; do not downgrade the task's DB acceptance gate to mocks.

These are reversible implementation/architecture choices under DECISION_RULES §§1,3. No founder Type 1 decision is needed while the exclusions hold. A request to expose a production route/port or change security policy is out of scope and must be escalated separately.

## BUG-008 interaction and recommended split rule

The source-level storage reader can be implemented without resolving BUG-008 because the reader changes no schema/migration and the two exact required tables/policies come from already accepted `0001` and `0003`. The test can apply those accepted SQL files directly to an isolated disposable DB; it must not infer or reconcile any existing environment's migration history. However, the reader should not be dispatched as an accepted combined SEC-FU1c task until the non-bypass proof harness is available. Current records only establish a historical empty local Compose DB and existing unit mocks; they do not establish the present container state or a provisionable non-bypass test role. If preflight cannot create the isolated proof environment, split now: ship the HTTP guard/request attachment with a test-only mocked resolver as a guard-only slice, and leave storage adapter plus actual RLS proof blocked. Do not let BUG-008 block the guard-only slice or use it as a reason to alter migration history.

## Current blockers / ready-to-dispatch status

- Root must record the five decisions/prerequisites above and run a safe tool preflight. No scratch DB credentials, connection strings, or secret-bearing command output belongs in the evidence.
- If the disposable Postgres/NOBYPASSRLS role can be provisioned and the two accepted migrations can be applied in isolation, the combined bounded guard+reader candidate is ready for implementation under fresh platform/security review. Otherwise only the guard-only split is ready; the reader cannot satisfy its mandatory proof gate yet.
- Existing PR #220 is not candidate work, no SEC-FU1c branch exists, and current checkout contains unrelated ST-051d edits. Start from the intended accepted base/clean isolated branch once root selects it; do not use the current PR head as the candidate base.
