---
id: SEC-FU1a
title: Reject malformed signed JWT claims
type: task
milestone: M1
owner_role: dev-backend
reviewers: [architect-platform, security-privacy, conductor]
size: S
status: DONE
depends_on: [ST-044]
allowed_paths:
  - SubTrack/apps/api/src/auth/sessions/jwt.service.ts
  - SubTrack/apps/api/src/auth/sessions/jwt.service.spec.ts
  - SubTrack/.sdlc/tasks/SEC-FU1a.md
  - SubTrack/.sdlc/tasks/ST-124.md
  - SubTrack/.sdlc/tasks/ST-168.md
  - SubTrack/.sdlc/tasks/BUG-021.md
  - SubTrack/.sdlc/backlog.yaml
  - SubTrack/.sdlc/metrics.json
  - SubTrack/.sdlc/reports/2026-10-05-maintenance.md
---

## Goal
Reject correctly signed payloads that do not satisfy JwtClaims runtime types before evaluating expiry. This is separately ready defensive work under SEC-FU1; full principal/bootstrap integration remains blocked.

## Acceptance and scope
- Parsed payload is a plain JSON object. sub/sid are nonblank strings; iat/exp are finite integers. Conductor explicitly accepts exp>iat as internal consistency for the existing issued claim profile after platform/security readiness review.
- Keep issuance, EdDSA/header/claim names, 15-minute issuer TTL, existing expiry check, opaque valid IDs and development key fallback unchanged.
- No UUID validation, future-iat/skew/maximum verifier lifetime policy, key provisioning, HTTP transport, route/controller/guard/session lookup/RLS/module registration or public contract change.
- Preserve existing roundtrip/expiry/tamper tests; reject correctly signed primitives, arrays, missing/wrong-type/blank claims, fractional/nonfinite timestamps and exp<=iat. Otherwise-valid fixture expiry is in the future so expiry rejection cannot hide missing validation. Ephemeral test keys stay in memory and test environment is restored.
- Required platform/security reviews, scoped lint/typecheck, meaningful API regression suite and changed-source coverage>=80 all metrics; current-head full CI with every required step successful before acceptance.

## Handoff
Fresh Luna implementation prepared the scoped two-file patch. Independent fresh Luna platform and security reviews APPROVE_SOURCE. Isolated focused32tests and fullAPI125tests/10files PASS; copied-source typecheck PASS. Root reconciled source with accepted main8805e3752e8799a68258b23e7fbe02bb69d9180b. Final branch full API125tests/10files PASS; scoped ESLint and typecheck PASS. V8 coverage of jwt.service.ts: statements39/39, branches27/27, functions5/5, lines38/38 (100% each). Reviewed source differs only by the repository formatter; exact formatted-source comparison PASS. Current-head CI remains pending. No authenticated-request-principal, live-RLS, real BankID or security-all-clear claim.

## Conductor bookkeeping scope
Reconcile already accepted ST-124 (PR132, current-head CI37366329360:25 quality+9 Compose steps successful,35MLtests, source/data/devops reviews) and ST-168 (approved PR150) only after merge. Record unaccepted BUG021 at its preserved branch, with no Orbit source or baseline adoption in this task. Refresh metrics from an explicit named Git ref.

## Acceptance receipt
PR151 merged to main c1956b52b0a4b26e234a3f833da0d9086d5ad283 from954b25a34151af6a63c8508eaa62d32af9cf2025. Exact-head CI37370589254:25quality+9Compose steps SUCCESS, none skipped. Required independent platform/security reviews and final branch125APItests/lint/typecheck/100%JWTcoverage passed. Source branch deleted only after exact squash-tree equivalence and head-leased remote deletion. Broader SEC-FU1 remains blocked.
