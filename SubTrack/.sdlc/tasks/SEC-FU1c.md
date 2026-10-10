---
id: SEC-FU1c
title: Internal existing-JWT HTTP principal guard
milestone: M1
owner_role: dev-backend
reviewers: [architect-platform, security-privacy, qa-engineer, conductor]
size: M
status: IN_REVIEW
depends_on: [SEC-FU1b]
allowed_paths:
  - SubTrack/apps/api/src/auth/sessions/authenticated-principal.guard.ts
  - SubTrack/apps/api/src/auth/sessions/authenticated-principal.guard.spec.ts
  - SubTrack/apps/api/test/authenticated-principal-http.spec.ts
  - SubTrack/.sdlc/tasks/SEC-FU1c.md
  - SubTrack/.sdlc/evidence/SEC-FU1c/**
  - SubTrack/.sdlc/backlog.yaml
---

## Scope and readiness

Conductor adopts the platform proposal's guard-only split. Docker, PostgreSQL tooling and WSL are absent on this desktop; storage-reader/live-RLS proof cannot yet run. Implement only an unregistered Nest CanActivate guard around the accepted PrincipalResolver. No production module/provider/route registration, schema, migration, dependency, JWT-policy, browser auth or database operations. Parent trusted-principal/storage/RLS integration stays blocked. Read AGENTS, Constitution, Decision Rules, SEC-FU1a/b, backend-next-contract and proposal.md. Independent platform/security readiness approval is required before author dispatch.

## Local architecture choices

1. Exactly one raw Authorization header, names case-insensitive; one Bearer credential with optional surrounding SP/HTAB and case-insensitive scheme. Token contains no whitespace/comma. Reject missing/duplicate/equal duplicate/malformed/unsupported schemes and mixed known v2 access/refresh credential cookies. Unrelated cookies may be present. Do not use normalized headers as fallback or accept body/query/X-Caller-Id as authority. Preserve existing JWT profile and opaque IDs; no new verifier or UUID validation.
2. Resolve through injected Pick<PrincipalResolver,'resolve'>. Production DI/module wiring belongs to the first separately contracted consumer. Test-only Nest probe may instantiate the guard explicitly; no actual app graph changes.
3. Attach only a copied freshly frozen VerifiedPrincipal and freshly frozen existing one-field RequestContext derived from its identityId, using module-owned symbol keys/nonenumerable properties. Provide typed retrieval helpers for later consumers; they reject requests without guard-derived state. Clear prior attachments on each guard attempt so failed repeat validation leaves no stale authority. No ambient/global principal or success cache.
4. HTTP-context only. All parsing/resolution/missing attachment failures return UnauthorizedException('Unauthorized') without raw inputs/cause/logging. Symbols prevent collision with request body fields and omission from ordinary JSON/log serialization. Principal attachment proves only the injected accepted resolver result; it grants no live reader/DB/RLS proof.
5. Guard holds no handler transaction. Future repositories must scope their operations with withRequestTransaction using verified context; source storage-reader and actual PostgreSQL role proof stay a separate blocked follow-up.

## Tests and gates

Guard unit tests: raw-header cardinality/case/whitespace, unsupported/mixed credentials, spoofed caller/body/query fields ignored, resolver call inputs/ordering, generic failures, frozen symbol-attached values, zero logging, fresh resolution on every call and stale state cleared after failure. Test-only Nest HTTP probe uses actual existing JwtService + PrincipalResolver with a fixture reader; invalid signed token has zero reader calls, accepted JWT receives fixture principal only, revocation/deletion/mismatch/reader failure map to same 401. No credential-bearing logs/snapshots.

Focused tests, meaningful full API regressions, lint/typecheck/build, explicit guard100%branch evidence, independent platform/security source and QA approvals, required CI before merge. No live PostgreSQL or complete production authentication claim. SEC-FU1c can finish its guard-only acceptance independently of BUG-008; this does not unblock runtime exposure or the storage proof.

## Independent readiness acceptance clarifications

2026-10-10 security/platform APPROVE_READINESS for guard-only split. Bearer grammar: surrounding SP/HTAB only, case-insensitive scheme, at least one SP between scheme/token (additional SP/HTAB allowed), no token whitespace/comma; reject CR/LF/other whitespace. rawHeaders must be an even-length array of primitive string pairs, no normalized-header fallback. Reject exact case-sensitive st_v2_access/st_v2_refresh cookie names across every raw Cookie header, including empty/quoted values; match names, not substrings. Symbols stay private; helpers require own guard attachments, rejecting inherited/absent state. Attachment properties nonenumerable/nonwritable/configurable; clear both before parsing/await and on any failure including partial attachment failure. Test failed repeat then retrieval, fresh successful repeat, malformed raw pairs, non-HTTP context and empty known credential cookies. Ephemeral test keys only; restore environment. These prevent ordinary request collisions/serialization, not trusted in-process tampering. Source review/coverage/QA/CI remain gates; no DB/RLS/runtime registration authority.


## Verification handoff
Independent security/platform source and QA APPROVE. Full API 1155 tests, lint/typecheck/build and guard 32/32 branch coverage PASS. See evidence/SEC-FU1c/verification.md. Exact-head CI pending; no runtime/storage/RLS acceptance.
