# ST-219 QA report (2026-10-10)

Verdict: **PASS for contract QA; exact-head repository CI still required before merge.**

- Scope reviewed: contract-only `/v2/subscriptions/{id}/read`; no runtime or browser readiness is established.
- Redocly OpenAPI lint: PASS (`redocly lint openapi.yaml --extends=spec`).
- TypeScript contract package: PASS (`tsc --noEmit -p tsconfig.json`).
- Contract suite: PASS, 13 tests, 0 failed/skipped; includes 2 focused browser-read tests, V1 baseline and existing-v2 semantics.
- Zod fixture generation and probe: PASS.
- Production SDK/Zod regeneration: PASS; all 9 frozen source/generated Git blobs match before and after.
- Focused acceptance evidence: required POST/UUID/empty JSON/no query, cookie-only authority, Origin/CSRF, bounded errors, privacy projection and pure-read semantics are covered by contract assertions and generated-schema checks. V1 baseline test passes.
- Independent source reviews available: architect-client APPROVE, security-privacy APPROVE_SOURCE (no High/Critical finding), architect-platform APPROVE.
- Remaining merge gates: exact-PR-head applicable CI (including integration/i18n/secret/licence/bundle checks as applicable), required review completion and Conductor gate audit. Runtime behavior remains unimplemented and unverified.