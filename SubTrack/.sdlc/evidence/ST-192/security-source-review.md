# ST-192 security/privacy source review

Decision: **Approve as Type 2a, conditional on the existing ST-191 accepted-source gate and the development-only registration boundary.** Review limited to the four frozen files; no source, Git, metadata, or QA changes were made.

The service snapshots configuration and trusted receivers, copies the 256-bit HMAC key, accepts only strict web proof bodies and unique raw headers, requires direct HTTPS/origin/binding-cookie evidence, and reserves idempotency before terminal nonce consumption. It validates consumed nonce context and leaves nonmatching proof scopes to the issuer. Only issuer rejection maps to 401; nonce/reservation conflicts map to 409, throttle to 429, and later failures to bounded 500. The issued token is resolved to a current principal and owner-scoped session row; refresh hash, browser context, binding hash, clock, and final row state are checked before CSRF minting. Completion settles before one two-cookie publication; failure cleanup is limited to the known row and verified CSRF authority, and stops after headers are sent. The module remains explicit opt-in and development-only, and includes parser-error no-store handling. Tests cover hostile accessors, mismatch isolation, race/replay, cleanup, HTTPS cookies, malformed JSON, and default-route absence.

No blocking finding in the reviewed source. Evidence scope is limited to the supplied source and recorded root QA; this is not production/client readiness or full transactionality approval.

SHA-256 (verified against current files):
- `apps/api/src/auth/sessions-v2/v2-web-session-http.ts` — `72c9fc46f5e78d079a579e8d97efa774967bc2b844e9c624ef670efc111d8822`
- `apps/api/src/auth/sessions-v2/v2-web-session-http.module.ts` — `e42cca4d9394c0c939db909f7f10da83c7079cb07a0575fc7c83d8a9f2735695`
- `apps/api/src/auth/sessions-v2/v2-web-session-http.spec.ts` — `5c935ec4beb3d7885adb0500d9fe0151eeac8f609fd86c9f0ec56469642fa843`
- `apps/api/test/v2-web-session-http.spec.ts` — `317f704f979ece2dcd5683dc43ffcc154ed5e583230054d2b883ec1b16f9fdc9`
