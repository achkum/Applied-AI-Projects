# ST-218 independent architect-client readiness (2026-10-10)
1. Verdict: **APPROVE Type 2a planning only**, conditional on independent security/privacy readiness; this grants no source, runtime, or user-facing authority.
2. Accepted `extractV2BrowserEvidence` (`apps/api/src/auth/http/v2-browser-context.ts`, blob `15fb3040`) requires exactly one raw `Origin`; missing/duplicate values fail closed.
3. [Fetch § append a request Origin header](https://fetch.spec.whatwg.org/#append-a-request-origin-header) does not guarantee `Origin` for same-origin GET/HEAD; browser JavaScript cannot manually set this forbidden header.
4. The revised contract uses `POST /v2/subscriptions/{id}/read`, exactly `{}` JSON body and no query, with exact allowlisted `Origin`, `st_v2_access` + browser-binding cookies, and session-bound `X-Session-CSRF`.
5. This POST is read-only; it uses the accepted detail projection and has no mutation/idempotency claim. ADR-0010's idempotency requirement applies to **mutating** POSTs.
6. Same-origin HTTPS browser POST automatically supplies `Origin`; require an actual browser test before treating this as settled. Do not synthesize a header or accept an absent `Origin`.
7. Status-only `PATCH /v2/subscriptions/{id}` is a later separate contract/runtime task; both paths reject duplicate/mixed credentials, selectors and malformed body before owner data access.
8. Bind principal through accepted v2 token verification, current owner session, exact web origin, chain, binding-cookie hash and second current read as exemplified by `v2-web-revocation-http.ts` blob `5ba20e39`.
9. `DevelopmentV2PrincipalResolver` blob `13c6f48c` alone does not verify the browser-binding cookie; the HTTP adapter must check it and never trust request identity fields.
10. `SessionCsrfGuard` blob `937ba9cc` is an in-memory, session-bound primitive; its guard is not itself an authentication adapter or persistent store.
11. Preserve strict 400, unauthenticated 401, CSRF 403, identical foreign/missing 404, masked 500, no-store, seven locked status pairs and uncertain-PATCH reread; money remains integer minor units.
12. Final source inventory blob `c7899b4cf144be40b6007a444aa9c3dc98b2a38c`, plan `70a6a454e91cdce98f7173da3ee6ba8146b198a9`, next contract `74057c154fffdd0350f70864ca9d6e608c9ba151`, ADR-0025 `10ef42f6dbe6d7e967808abec6029cc83f7ea4da`.
13. Direct HTTPS and exactly one access + distinct binding cookie precede owner access; reject Authorization, refresh, duplicates and selectors. Verify token `sid/sub`, hash binding cookie, call `webContextForCurrentSession`, then resolver (which checks its supplied chain), compare returned owner/session, and verify CSRF.
14. First M contract task changes OpenAPI/generated bindings/tests only and stays `unavailable-default`; later runtime proof needs actual HTTPS browser, cookies, POST Origin, owned PG16 RLS and negative origin/CSRF/revocation/concurrency cases.
15. No enrolled browser account, durable v2 session, real BankID, or user-facing activation is proven by the synthetic in-memory fixture; ST-217 UI remains NOT_READY.
16. If product requires GET, review an explicit cross-origin same-site HTTPS topology and exact credentialed CORS/preflight contract separately; no missing-Origin waiver is approved here.
