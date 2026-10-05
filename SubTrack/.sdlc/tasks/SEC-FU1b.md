---
id: SEC-FU1b
title: Resolve verified principals against current session ownership
type: task
milestone: M1
owner_role: dev-backend
reviewers: [architect-platform, security-privacy, conductor]
size: S
status: IN_REVIEW
depends_on: [SEC-FU1a]
allowed_paths:
  - SubTrack/apps/api/src/auth/sessions/principal-resolver.ts
  - SubTrack/apps/api/src/auth/sessions/principal-resolver.spec.ts
  - SubTrack/.sdlc/tasks/SEC-FU1b.md
  - SubTrack/.sdlc/tasks/ST-076.md
  - SubTrack/.sdlc/tasks/ST-057.md
  - SubTrack/.sdlc/backlog.yaml
  - SubTrack/.sdlc/metrics.json
  - SubTrack/.sdlc/reports/2026-10-05-maintenance.md
---

## Goal and readiness boundary
Implement only a standalone internal principal-validation core following the independently approved principal policy. No caller-facing route, guard, registration, storage adapter or transaction binding. The prior decision artifacts blocked the complete principal/transaction integration; this narrower pure core requires independent security/architect readiness review before author dispatch. Public contracts, deletion founder choice, migration inventory and live RLS remain separate prerequisites to that future integration.

## Must read
AGENTS.md; Constitution; DECISION_RULES; API_CONTRACT auth policy; SEC-FU1a; existing JwtService and request-transaction RequestContext; Prisma Identity/Session fields. Current internal-policy reviews and preflight are at /workspace/.setup/auth-internal-{platform,security}-review.md and principal-core-preflight.md. They approve policy only, not endpoint exposure.

## Acceptance
- Plain unregistered resolver receives only a token string, the existing JwtService verifier and an injected read-only session/owner reader. Verify first; invalid JWT causes no storage read. Preserve opaque IDs and existing JWT claim/expiry policy.
- Reader takes session ID plus a readonly existing RequestContext containing only verified JWT sub as userId, used strictly as a lookup scope before authentication succeeds. No client identity input. No RequestContext definition change, transaction invocation or authenticated context publication.
- One reader operation returns a current consistent Session/Identity snapshot using only existing id/identityId/revokedAt and id/deletedAt fields. Future adapter must scope by both signed sid/sub and obtain consistent current state; no DB adapter/query/schema added here. The primitive validates the supplied snapshot, not the adapter or live database.
- Reject absent session/identity, sid mismatch, revoked session, session identity mismatch, returned identity mismatch or deleted owner. Return a freshly frozen readonly {identityId, sessionId} copied from validated data. Revalidate on every call; never cache success. No household owner/membership/default selection in this slice.
- Signature errors, lookup errors and every invalid snapshot use the same generic unauthorized failure with no internal cause, ownership data, token or PII in messages/logs. No route/wire or key-provisioning change.
- Meaningful tests prove verifier-before-read, exact trusted scoped arguments, current ownership/active state, all rejection branches and generic failures, immutable copied snapshot, and repeated resolution after revocation. Include an actual existing-JwtService issue/verify integration test; ephemeral keys remain in memory and no test secret changes persist.
- Policy code 100% branch coverage; scoped lint/typecheck, existing full API suite, independent fresh Luna architect-platform and security-privacy source approvals, exact-head all34required CI steps SUCCESS before Conductor merge. Author <=8actualnestedcalls/15min, no tests/heavy jobs; root owns single suite/build/CI. Whole PR <=450non-generated changed lines.

## Explicit integration gates
Do not register/import resolver into production modules, controllers, guards or handlers. No auth/session module exposure, HTTP transport/CSRF/bootstrap/refresh/deletion policy, RequestContext/RLS claim, SQL/migration or data rights changes. Passing unit checks does not authenticate current HTTP routes; existing X-Caller-Id and lifecycle findings remain open.

## Handoff
Independent architect/security APPROVE_READINESS at /workspace/.setup/principal-core-readiness.md: only the supplied snapshot is validated; adapter consistency/scoping/freshness and RLS are not proven. Fresh Luna author dispatched; founder already authorizes continuing independently ready development. Root alone reconciles accepted Home PR155 tracking and separate pending G-DESIGN evidence.

## Frozen verification
FinalcorrectAPI-directory suite138tests/11filesPASS, no skips; principal-resolver100%statements/branches/functions/lines. Scopedlint/typecheckPASS after normalPrismageneration. Firstroot-directoryVitest invocation included23unrelatedsuites and is excluded; generic401test initially omittedNest’s standarderrorfield, corrected without resolver changes. Independent platform/security source APPROVE after inspecting correctedassertion/finalcoverage. NoHTTP/DB/RLS claim; exact-head CI pending.
