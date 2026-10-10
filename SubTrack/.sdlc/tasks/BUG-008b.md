---
id: BUG-008b
title: Clean migration sequence and actual PostgreSQL privacy proof
type: bug
milestone: M2
owner_role: architect-platform
reviewers: [architect-platform, security-privacy, qa-engineer, devops-release]
size: L
labels: [database, security, complex]
status: IN_REVIEW
depends_on: [BUG-008a]
allowed_paths:
  - SubTrack/apps/api/prisma/migrations/**
  - SubTrack/apps/api/prisma/schema.prisma
  - SubTrack/apps/api/prisma/reconciliation-target.json
  - SubTrack/apps/api/src/households/households.service.ts
  - SubTrack/apps/api/src/households/households.service.spec.ts
  - SubTrack/apps/api/src/privacy/privacy.service.ts
  - SubTrack/apps/api/src/privacy/privacy.service.spec.ts
  - SubTrack/docs/architecture/adr/0021-dependant-membership-profile.md
  - SubTrack/.sdlc/evidence/BUG-008/legacy-migrations/**
  - SubTrack/apps/api/test/clean-migration-rls.integration.ts
  - SubTrack/apps/api/vitest.clean-migration.config.ts
  - SubTrack/tools/database/clean-migration-proof.sh
  - SubTrack/tools/auth/session-owner-rls-proof.sh
  - .github/workflows/subtrack-clean-migration-proof.yml
  - SubTrack/.sdlc/tasks/BUG-008b.md
  - SubTrack/.sdlc/tasks/BUG-008a.md
  - SubTrack/.sdlc/tasks/BUG-008.md
  - SubTrack/.sdlc/evidence/BUG-008b/**
  - SubTrack/.sdlc/backlog.yaml
---

## Goal and accepted prerequisites
Make the complete canonical migration sequence clean-installable and prove its privacy on disposable PostgreSQL16. Phase A accepted PR235/main2242f46, source41cc7c5; standard38060569470/container38060569532/session38060569409 PASS. Founder explicitly reports no existing SubTrack databases; stop if one is discovered. Read AGENTS/governance/AGENT_CONTRACTS, amended BUG-008, BUG-008a schema/fixture, all plan/review evidence, DATA_MODEL, ST-048/060/067 and accepted ADR-0016/BUG-013.

## Scope and acceptance
- Move the seven unapplied legacy migration.sql files recoverably outside the active directory to the allowed evidence archive, preserving accepted blobs. On Windows, verify resolved absolute source/destination paths stay inside this workspace; move exact files, not computed recursive directory deletions. No applied history is rewritten or persistent database touched.
- Generate a clearly marked initial full-schema SQL migration from the exact accepted Prisma schema, documenting pinned Prisma6.19.2 command and hash. A separate handwritten migration contains SQL-only constraints, grants, narrow helpers and command-specific RLS after all dependencies exist. No intermediate active chain missing privacy is accepted. No DROP, reset, migrate-resolve or forced application.
- Preserve identity/session/household/OTP/invitation/audit and banking/catalogue/subscription/share/charge features. Fix forward references and recursive household/subscription/share/consent policies. No permissive all-command invitation policy may override restricted mutations. Existing source privacy semantics remain authoritative.
- Owner-only SELECT/INSERT/UPDATE/DELETE for banking/transactions/charges, immutable owner IDs and composite owner FKs. Catalogue ordinary-role SELECT only with service-role writes. Session/identity/consent owner boundary; OTP pre-identity service-only, ordinary runtime has no grants. Audit owner SELECT/actor INSERT, no UPDATE/DELETE. Implement explicit WITH CHECK and mutation limits.
- Subscription visibility: owner OR active explicit share to an active household member OR owner open_book/common active household while not always_private. Explicit share may expose an always-private subscription by owner choice. New share requires owner + active target membership; owner revocation works after departure; forbid retarget, shared_by changes, revival and DELETE. Test affected row counts and denials, not SQL mirrors.
- Proposed definer lookup role is NOLOGIN/NOINHERIT/BYPASSRLS with exact column SELECT only, not table owner. No runtime membership/SET ROLE/schema CREATE. Narrow Boolean functions accept target IDs only, derive requester from trusted transaction-local context, fixed search_path/qualified relations, revoked PUBLIC EXECUTE and runtime-only grants. No dynamic SQL or generic private row/consent accessor. Exact source security review must approve functions/grants before acceptance; runtime stays non-superuser/non-BYPASSRLS/non-owner.
- Preserve BUG-013 dual transaction-local same-principal context. Missing/malformed/mismatched context fails closed. Constrain confidence, original amount/currency pairing, matched charge links, active share uniqueness. Define captured charge write semantics explicitly using source-backed signed minor units/date/currency without inventing financial arithmetic or indefinite raw payload storage.
- Existing session-owner proof script currently reads archived legacy files by pinned hashes. Update only its source archive path/description; keep hashes, assertions, job and extraction meaning intact. It remains a historical focused fixture, not the new whole-chain proof.
- New mandatory path-filtered CI proof creates ONLY its owned disposable PG16 fixture, ignores inherited DATABASE_URL, uses randomized ephemeral credentials with no logs/commits, applies full Prisma migrate deploy, compares catalog/schema/enums/keys/checks/indexes/RLS/grants to the independent Phase A fixture. Use an actual ordinary LOGIN test connection inheriting runtime grants, not a superuser session merely SET ROLE. Assert no table ownership, superuser/BYPASSRLS/helper membership or SET ROLE/function/schema mutation capabilities.
- Actual PG tests cover owner/unrelated, active/departed owner/viewer, explicit active/revoked share, open_book on/off, always_private, multiple households, bank/charge/transaction/consent/session/OTP/audit/invitation command boundaries, immutable fields, cross-owner FK links, catalogue write denial, recursion, missing/invalid principal, rollback and pooled connection reuse. Sanitized counts/receipts only. Prove modeled-schema drift is empty and catalog-check SQL-only requirements; no fake runtime HTTP principal proof is inferred.
- Independent platform/security source review, QA/devops proof review and all required exact-head CI precede merge. Parent BUG-008 is DONE only after the complete chain/proof passes. No endpoint/default/provider/delivery/key/production/public operation.

## Budget and execution
Conductor grants <=1,400 nongenerated changed lines for this cohesive migration plus least-privilege proof; generated initial SQL and unchanged archived renames are excluded. Target handwritten SQL+tests/tool/workflow<=950; stop before exceeding1,400. Manual original attempt/failure/time counters stay intact; task_guard fcntl is unavailable on Windows. Checkpoint at20 calls/30min; no reset to evade loop limits.

Local Docker/psql are absent. Do not fake local DB evidence: generate/inspect artifacts and run lint/typecheck/static script checks, then obtain actual disposable proof on CI. One heavy local job at a time; ask Conductor before tests while other work owns it. CI on independent runners may run in parallel. Use registered task-label/container-id cleanup only; never target another database or resource.

## Official references checked 2026-10-10
[PG16 RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html), [CREATE POLICY](https://www.postgresql.org/docs/16/sql-createpolicy.html), [CREATE FUNCTION](https://www.postgresql.org/docs/16/sql-createfunction.html). Policy privileges, permissive OR and definer safety require actual tests, not prose acceptance alone.

## Handoff
Implementation and local static/API checks are ready for disposable PG16 CI; storage is not proven usable yet. See `.sdlc/evidence/BUG-008b/checkpoint-context-4.md` for exact hashes and bounded results. Required next gates: draft PR, owned PG16 migration/policy proof, exact-source security/platform reviews, QA/devops review, exact-head CI. Parent BUG-008 remains open.

## Type 2a amendment 2026-10-10
Architect dependant_schema_resolution confirmed existing DATA_MODEL/PRODUCT_SPEC/ST-046 require a dependant profile without login Identity. Conductor authorizes nullable member identity/relation, member display_name, exact role/identity CHECK, matching regenerated baseline and independently reviewed fixture, and narrow addDependant service/test correction. Preserve all other accepted Phase A semantics. Additional 200 nongenerated lines are reserved for this discovered prerequisite; total cap1,400. Fresh exact-source platform/security review and actual PG proof are required; no existing database is modified. Record ADR0021 with the source requirements and architect decision.

Narrow Type2 compatibility scope: privacy household preview must filter identity-less dependants before identity-based consent/subscription visibility, with a regression assertion. It grants no dependant login, consent or owner authority.
