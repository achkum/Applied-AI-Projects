# ST-237 contract and ordinary storage author handoff

Scope: source only after C4 TLS/QA full-feature GO. No Git action, provider activation, public listener or qualified SQL010 business-DDL edit in this lane. The qualified installer remains a separate database path from ordinary migration 0003.

## Exports and exact contract

`POST /v2/me/profile/read` (`readV2BrowserProfile`) requires JSON `{}` and current exact-Origin/current-CSRF web cookies, returns closed `ProfileView`; `PATCH /v2/me/profile` (`patchV2BrowserProfile`) requires the existing nonempty five-field closed `ProfilePatch` and the same current authority, returning a known-committed closed view. Both routes document only `V2WebAccessCookie`, no query or idempotency key for the read. Generated SDK, types and Zod bindings were regenerated. Status/code pairs are 400 `INVALID_PROFILE_REQUEST`, 401 `AUTHENTICATION_REQUIRED` (all collapsed current-authority failures), 403 `PROFILE_REQUEST_REJECTED` (envelope syntax only), 409 `PROFILE_CONFLICT`, and 500 `INTERNAL_ERROR`. Closed RFC 9457 profile problem type has only `type/title/status/code`, and the response contract requires `Cache-Control: no-store`, `Pragma: no-cache`. Backend must enforce pairwise status/title/code and strict ingress/egress decoders; OpenAPI enums alone do not enforce that relation. The existing V2 POST test now excludes only this pure CSRF-protected read from its ten idempotent POST checks.

`apps/api/prisma/migrations/0003_enrollment_profile/migration.sql` mirrors SQL010's identity additions and profile table/policies/grants. Prisma maps the same business columns and FK. The clean migration proof expects three ledger entries with the new SHA-256 checksum, still asserts modeled drift, and runs the new profile business catalog/RLS test through the existing test entrypoint. The new test checks all profile columns/types/nullability/defaults, PK/restrict FK/three checks, FORCE RLS, command-specific owner policies, runtime/PUBLIC/service grants, own read, foreign update denial, and missing/mismatched/malformed dual-GUC denial. It does not install or stack qualified SQL010.

## Focused source checks

- Contract generation: PASS, five generated files reported; actual diff in four generated files.
- Redocly contract lint: PASS.
- Contract TypeScript typecheck: PASS.
- Node contract assertions: 23/23 PASS. The package `test` wrapper exits 1 after these assertions because Windows cannot resolve its nested `pnpm test:zod-fixture` executable. Running the exact fixture generator via `corepack pnpm exec openapi-ts -f ./openapi-ts.fixture.config.mjs --no-log-file` and exact Zod fixture decoder check directly both PASS.
- Prisma validate with a placeholder localhost `DATABASE_URL`: PASS; validation did not connect to a database.
- `git diff --check` for scoped nongenerated tracked paths: PASS.
- Actual disposable PG16 ordinary and qualified catalog comparison: pending integrated CI proof; no local PG proof was claimed.

Nongenerated source delta is about 280 added lines, under the lane's 500–750 estimate. Root owns actual integrated PG/browser proof and workflow. Ensure ordinary 0003 deploys before generated Prisma client use; generated default identity queries select the new columns.

Narrow follow-up: the expected default-value pairs in profile-business-schema.integration.ts are immutable tuples (`as const`), so TypeScript knows the compared fragment is present. Root will rerun API typecheck; no heavy check was run in this correction.

Catalog equivalence handoff: `readProfileBusinessCatalog(db: PrismaClient)` in `apps/api/test/profile-business-catalog.ts` returns ordered JSON-safe `{columns,constraints,relation,policies,tableAcl,columnAcl}` for actual PostgreSQL business catalog. It includes the three added identity columns, all identity_profile columns, PK/FK/check definitions and actions, FORCE RLS, policy SQL/roles, and explicit table/column ACL. Only the migration table-owner role name is normalized to `TABLE_OWNER`; role grantees, PUBLIC, defaults and SQL definitions remain exact. The ordinary integration test writes `{"catalog": ...}` only when `ST237_ORDINARY_PROFILE_CATALOG_OUT` exactly equals `resolve(RUNNER_TEMP,'st237-ordinary-profile-catalog.json')`, using exclusive 0600 creation. Root's qualified proof should import the same function and compare its actual query result to that file, then remove the owned file on cleanup. This source addition received no local PG/typecheck run during concurrent backend checks.
