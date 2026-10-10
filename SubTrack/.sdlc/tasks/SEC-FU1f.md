---
id: SEC-FU1f
title: Quarantine untrusted legacy handlers from default API graph
milestone: M1
owner_role: dev-backend
reviewers: [architect-platform, security-privacy, qa-engineer, conductor]
size: M
status: IN_REVIEW
depends_on: []
allowed_paths:
  - SubTrack/apps/api/src/app.module.ts
  - SubTrack/apps/api/test/default-api-containment.spec.ts
  - SubTrack/packages/contracts/openapi.yaml
  - SubTrack/packages/contracts/generated/**
  - SubTrack/packages/contracts/tests/contracts.test.mjs
  - SubTrack/docs/product/API_CONTRACT.md
  - SubTrack/docs/architecture/adr/ADR-0018.md
  - SubTrack/docs/ops/SECURITY_FINDINGS.md
  - SubTrack/.sdlc/decisions.md
  - SubTrack/.sdlc/tasks/SEC-FU1f.md
  - SubTrack/.sdlc/evidence/SEC-FU1f/**
  - SubTrack/.sdlc/backlog.yaml
---

## Proposed Type2a containment contract

PO proposes a narrow default-runtime availability exception: remove PrivacyModule and DataRightsModule from AppModule imports so six unsafe legacy privacy/export/delete routes are unreachable until separately reviewed authentication, data-scope and lifecycle integration. Preserve every controller, service, DTO, schema and product feature requirement. No replacement credential authority, opt-in bypass flag, v2 behavior change, production deployment, existing database action, data deletion or permanent feature removal.

Independent platform/security classification: Type2a under DECISION_RULES sections1/4; ADR0010 itself is Type2a, outside founder-reserved seedADR0001..0008. Default withdrawal conflicts with ADR0010's preserve-v1 behavior clause; explicitly supersede only availability for these identified unsafe routes in shortADR0018 and the decision log before runtime edits. Do not silently reinterpret legacy preservation or remove OpenAPI schemas. Architect confirms feasibility and security containment approval before author dispatch. Conductor adopts Type2a only for this reversible repository change; no deployment or new security model authorized.

## Contract first and acceptance

Document unavailable default runtime routes in API_CONTRACT and annotate only those existing OpenAPI operations with a vendor runtime-availability marker/description. Keep paths, parameters, response schemas and generated wire shape intact; regenerate/check generated artifacts using existing toolchain. Then remove the two module imports/registrations from default AppModule. Both appModuleFor() default and configured v2 nonce/OTP graphs must omit those legacy handlers. Preserve ops endpoints and accepted opt-in v2 graph behavior, no legacy enable switch. Keep isolated legacy feature tests as internal implementation evidence; do not rewrite their header/deletion semantics in this containment.

New actual HTTP test-only Nest applications with Prisma overridden by a zero-access fixture verify404 for GET privacy/settings, PATCH privacy/open-book, GET privacy/preview-as/:householdId, POST data-rights/export, GET data-rights/export/:token, DELETE data-rights/account under default and configured graphs. Caller/body/Bearer/legacy headers cannot activate a handler; assert legacy controllers absent and no Prisma/feature calls. Positive ops health/version requests still succeed. Use logger:false, loopback ephemeral listeners, safe synthetic inputs and cleanup. No real DB or production bootstrap.

Update SECURITY_FINDINGS to record default-handler containment only; T1 remains open for later authenticated activation/data-scope readiness. Broader auth/provider/key/migration/export/deletion findings stay blocked. No High-risk acceptance or security all-clear.

## Gates

Read AGENTS/governance/ADR0010, API_CONTRACT, SECURITY_FINDINGS, legacy feature modules/controllers/services and accepted appModuleFor/config tests. Independent architecture/security readiness before contract/runtime changes. Separate source/QA review, contract generation drift checks, meaningful full API regressions/lint/typecheck/build, actual default/configured HTTP denial evidence and exact-head standard/container CI before merge. No deployment. Under600 nongenerated lines; stop for conflicts rather than widen authority.

## Independent readiness
2026-10-10 architect/platform/security APPROVE_READINESS aftergeneratedpathcorrection. AllsixHTTP URLs begin/v1/. SupplyvalidsyntheticUUID/body/token so400validationcannotfakecontainment. POproposalfeasible; ConductoradoptsType2a withnarrowADR0010availabilitysupersessionbeforecode, noType1or deploymentauthorization. Finalsource/QA/generation/exactCIrequired.

Contractversionrule: Conductor adopts metadata-only OpenAPI info.version1.1.0->1.1.1 for the explicitADR0018 runtimeavailability exception. No URL/schema/credentialprofile versionchange; docs muststate defaultwithdrawal is intentionalavailabilitybreak andnotbackward-runtime compatibility orrolloutapproval. This appliesAPI_CONTRACT breaking-change ADR+bump rule; finalarchitect/securityreviewrequired.

## Review handoff
Independent platform/security APPROVE_SOURCE and APPROVE_QA, no findings. Reviewer independently executed focused containment: 3/3 tests, 72 actual HTTP denials. Author full API 1180 tests/57 files, lint/typecheck/build and contract validation/regeneration drift PASS. Evidence: `.sdlc/evidence/SEC-FU1f/author-verification.md`. Exact-head standard/container CI remains required before Conductor acceptance; no deployment or broader security readiness claim.

CI repair contract: standard CI38047426208 correctly rejected the pre-ADR0018 legacy semantic snapshot after the six documented availability annotations changed it. Conductor adds only the existing contracts regression test path. Retain the complete semantic hash guard and all wire assertions; explicitly adopt ADR0018's reviewed documentation snapshot and assert exactly six unavailable-default operation annotations plus metadata version1.1.1. Do not delete/skip/relax generation, route, schema, response or credential assertions. Independent review and fresh exact-head CI required.
