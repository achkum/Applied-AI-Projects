---
id: SEC-FU1e
title: Composed existing-JWT HTTP guard and real scoped storage proof
milestone: M1
owner_role: dev-backend
reviewers: [architect-platform, security-privacy, qa-engineer, conductor]
size: M
status: IN_REVIEW
depends_on: [SEC-FU1c, SEC-FU1d]
allowed_paths:
  - SubTrack/.sdlc/evidence/SEC-FU1d/actions-38046125441/**
  - SubTrack/apps/api/test/authenticated-principal-storage.integration.ts
  - SubTrack/apps/api/vitest.session-owner.config.ts
  - SubTrack/tools/auth/session-owner-rls-proof.sh
  - .github/workflows/subtrack-session-owner-proof.yml
  - SubTrack/.sdlc/tasks/SEC-FU1e.md
  - SubTrack/.sdlc/evidence/SEC-FU1e/**
  - SubTrack/.sdlc/backlog.yaml
---

## Proposed local test contract

Conductor adopts architect plan to prove the composed trust path, pending independent security/platform readiness review. SEC-FU1c HTTP tests use a fixture reader; SEC-FU1d actual PostgreSQL tests bypass the HTTP guard. Reuse the accepted classes without implementation edits: test-only Nest module, actual HTTP loopback request -> AuthenticatedPrincipalGuard -> PrincipalResolver -> PrismaSessionOwnerReader -> withRequestTransaction -> isolated PostgreSQL nonowner RLS role. No production modules/providers/routes, API/wire/security policy, JWT profile, migrations/schema, package/dependency or real database changes.

Reuse SEC-FU1d's exact hash-checked fixture and newly created container; expand its dedicated config/runner/workflow to execute both proofs, without weakening any existing assertion or changing accepted SQL extracts. Tests may initialize only synthetic fixture identity/session rows through owner credentials provided by this job, with separate per-test IDs. Reader authenticates as the existing distinct nonowner/NOBYPASSRLS client using pool1. Assert role/endpoint preconditions or explicitly use the shared validated fixture boundary; never inherited DATABASE_URL or external endpoints. Keys are ephemeral in memory; restore prior environment without printing it. Nest app uses logger:false, loopback-only ephemeral port, closes on all paths; every failure and cleanup exception is sanitized without credentials/SQL/IDs or raw causes.

## Required HTTP evidence

Real requests with valid accepted Bearer JWT deliver only the guard's verified principal and derived context to the probe. Raw missing/duplicate/unsupported/mixed known cookie credentials and malformed/invalid JWT return identical generic401 with zero reader access where appropriate. Spoofed X-Caller-Id/body/query identity never supplies authority or changes verified context. Signed cross-owner sub/sid, missing current rows, committed session revocation and identity deletion return same401 using the actual storage path. Check no handler call on failure and no credential-bearing request/response logs. Test response may return boolean matches and context shape rather than fixture values; no stored snapshots.

Prove sequential HTTP calls for different owners use correct verified context and same pooled backend with no local GUC authority retained after requests or failed storage validation. Include database failure mapped to same generic401 through guard and handler stays uncalled; use fixture-only non-destructive failure if feasible (no shared DB/schema changes). Assertions must not be swallowed as expected errors. Both proof files execute in dedicated CI, not skipped; existing full RLS proof remains independently mandatory.

## Gates and limits

Read AGENTS/governance/SEC-FU1a/b/c/d/BUG-009/BUG-013/BUG-008 and accepted proof files. Independent readiness then author; separate final security/platform source and QA approvals; lint/typecheck, full API regressions if impacted, exact-head normal/container CI and actual composed HTTP/PostgreSQL proof before merge. Local Docker is absent; static checks are not DB acceptance. This proves test-only composition, not a production session issuer/key lifecycle, v2 transport, protected feature activation, full migration sequence/history or broader data scope. BUG-008 remains blocked. Keep under600 changed nongenerated lines; report scope/size blockers rather than weaken evidence.

## Independent readiness acceptance
2026-10-10 platform/security APPROVE_READINESS. Actual storageerror uses correctlysigned nonblank opaque sub/sid causingDBUUIDcastfailure; prove delegatedrealreadercall, identical401/nohandler, samebackendGUCcleanup andlaterlegitimateHTTPsuccess. Instrumentationdelegatesactualreaderonly, never substitutesauthorization/snapshots/errors. Duplicateheaders use realrawpairHTTP incl equalvalues. Assertionsmustnotbe swallowed; sanitizedassertion/cleanupfailures stillfailgate. Bothproofs validateisolatedendpoint/rolepreconditions independently; no implicit executionordering.

Finalindependentplatform/security SOURCEandQA_SOURCE APPROVE, nofindings. Scopedlint/strictAPItypecheck/BashsyntaxPASS. NegativemissingDBconfigcheck discoversbothfilesandfailsclosed,noskips; notrealDBacceptance. Rootpushforactualcomposedproofpending. ParentSEC1dacceptedPR226@512aeb1 withdedicatedproof38046125441; sanitizedartifactreceiptcarriedforprovenance.
