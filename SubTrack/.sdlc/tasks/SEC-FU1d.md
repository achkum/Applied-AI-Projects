---
id: SEC-FU1d
title: Internal scoped Prisma session owner reader and disposable RLS proof
milestone: M1
owner_role: dev-backend
reviewers: [architect-platform, security-privacy, qa-engineer, conductor]
size: M
status: IN_REVIEW
depends_on: [SEC-FU1b, BUG-013]
allowed_paths:
  - SubTrack/apps/api/vitest.session-owner.config.ts
  - SubTrack/apps/api/src/auth/sessions/prisma-session-owner-reader.ts
  - SubTrack/apps/api/src/auth/sessions/prisma-session-owner-reader.spec.ts
  - SubTrack/apps/api/test/session-owner-rls.integration.ts
  - SubTrack/tools/auth/session-owner-rls-proof.sh
  - .github/workflows/subtrack-session-owner-proof.yml
  - SubTrack/.sdlc/tasks/SEC-FU1d.md
  - SubTrack/.sdlc/evidence/SEC-FU1d/**
  - SubTrack/.sdlc/backlog.yaml
---

## Proposed bounded contract

Conductor adopts the platform planner's next candidate, pending independent platform/security readiness approval. Read AGENTS, Constitution, Decision Rules, SEC-FU1a/b/c, BUG-009, BUG-013, BUG-008, current transaction helper and accepted migrations 0001/0003. Use accepted PrincipalResolver, SessionOwnerReader and withRequestTransaction. No route/module/provider activation, migration/schema edits, dependency changes, subscription operations, production keys, remote database access or deployment.

Implement an internal reader using one parameter-bound read-only session/identity join within withRequestTransaction. Select only session id/identityId/revokedAt and identity id/deletedAt. Signed claims provide lookup scope only; PrincipalResolver remains responsible for verification/current-state authorization. No coercion/UUID credential rule, unscoped alternate lookup, refresh hash selection or input logging. Preserve opaque JWT identifier policy; DB casts may fail and resolver maps failures to generic Unauthorized.

## Disposable proof boundary

GitHub Ubuntu runner may create a wholly new named scratch PostgreSQL container and apply only exact unchanged identity DDL/identity_self RLS statements and their prerequisite auth_method type from accepted 0001, plus accepted 0003, solely as an extracted fixture for identity/session RLS. This is not the full migration sequence, BUG-008 history reconciliation or proof of any existing database. Never connect to existing/remote database endpoints. Owner role provisions synthetic fixture rows only; reader client must authenticate as distinct non-owner NOSUPERUSER NOBYPASSRLS role without owner membership, with minimal schema/table SELECT grants. Assert role attributes, table ownership and enabled RLS before behavior tests. Cleanup only this job's created container and volumes; no shared prune/drop/reset.

Use actual Prisma client, withRequestTransaction, JwtService and PrincipalResolver. Prove active same-owner lookup; missing session; cross-owner session and identity invisibility; signed sub/sid mismatch; revocation and deletion checked against changed committed rows; malformed opaque identifiers fail generically; invalid JWT causes zero storage access; both GUCs scoped locally and sequential pooled requests cannot inherit authority; rollback/error cleanup. Fixture IDs/keys synthetic, ephemeral and omitted from logs/snapshots. No SQL/query errors or credentials in uploaded artifacts.

## Gates

Independent platform/security readiness before dispatch, source/QA review after author, focused tests plus full API regressions/lint/typecheck/build, meaningful reader coverage, exact-head standard CI and actual dedicated PostgreSQL proof before merge. Workflow contents:read only, scoped PR paths/manual dispatch, no secrets/public deployment, bounded timeout. Record source hashes and extracted statement boundaries. Do not execute whole 0001: its household policy references a later-created table. No Prisma migrate, _prisma_migrations, reordered full migration, suppressed SQL errors or BUG-008 status change. Exact extracted policy fixtures are not migration execution or history validation. If that boundary conflicts with governance, raise it before code. Source remains internal; no full authentication or subscription/RLS readiness claim.

## Independent readiness clarifications
Reader WHERE must parameter-bind both session sid and identity_id=context.userId, with same-statement identity join; reject impossible cardinality/malformed results. Independently prove RLS using direct cross-owner SELECT under app role, not merely reader predicates. Assert effective authenticated role, no owner membership and nonowner/NOSUPERUSER/NOBYPASSRLS/table RLS flags. Force pool size one and prove same backend PID reused for local-GUC sequential and rollback cleanup tests. Integration unavailability/failure is a failed gate, never skip. Container proof client URLs come solely from verified newly-created loopback endpoint; ignore inherited DATABASE_URL. Bind published port only to127.0.0.1, cleanup only recorded job-created container/volumes including start failure. Coverage100% reader branches. Fixture extraction does not satisfy BUG008 AC6 or alter any existing schema/history.

2026-10-10 independent platform/security APPROVE_READINESS after fixture extraction correction; fresh author dispatched. Fullsource/QA/coverage/realDBCI stillrequired.
