# ST-192 platform source review

**Decision: Approve with the reviewed Type 2a architecture constraints.** The bridge is module-only and explicitly enabled for development. Its config is copied and validated, requires canonical HTTPS origins and a 32-byte authority key, and captures trusted port methods. The handler rejects duplicate/raw evidence and malformed shapes before proof exchange, requires direct TLS evidence, uses bound session nonce validation, reserves idempotency before terminal consumption, and returns generic status mappings with no-store headers. CSRF minting follows issuer output validation, current-owner principal resolution, and current-row/hash checks. It builds the safe response and both cookies before one publication; rollback is exact-row guarded and skipped after headers are sent. The source and reported actual HTTPS tests cover malformed parser responses and default-app 404 behavior. No production readiness or end-to-end transaction guarantee is implied.

**Limits:** This is an independent source/plan review, not a rerun of tests or CI. QA evidence is taken from the supplied root QA report. The synchronous repository checks cannot make principal resolution and later publication one database transaction; the design correctly avoids claiming that guarantee. Only invalid-proof issuer rejection is 401; operational/unknown post-commit failures remain generic 500 and do not guess cleanup authority.

Reviewed exact-source SHA-256:

- `apps/api/src/auth/sessions-v2/v2-web-session-http.ts` — `72c9fc46f5e78d079a579e8d97efa774967bc2b844e9c624ef670efc111d8822`
- `apps/api/src/auth/sessions-v2/v2-web-session-http.module.ts` — `e42cca4d9394c0c939db909f7f10da83c7079cb07a0575fc7c83d8a9f2735695`
- `apps/api/src/auth/sessions-v2/v2-web-session-http.spec.ts` — `5c935ec4beb3d7885adb0500d9fe0151eeac8f609fd86c9f0ec56469642fa843`
- `apps/api/test/v2-web-session-http.spec.ts` — `317f704f979ece2dcd5683dc43ffcc154ed5e583230054d2b883ec1b16f9fdc9`
