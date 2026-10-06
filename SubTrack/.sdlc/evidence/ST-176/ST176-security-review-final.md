# ST-176 Security Source Review — Final

**Verdict: approve the reviewed development-only source slice for the security/privacy review gate.** This is an actual-source review at the hashes below. It is not production readiness, deployment, or release approval. The implementation retains process-local nonce, idempotency, and throttle state and the documented restart/distributed-abuse limitations.

## Review result

The route accepts transport evidence only from the ST175 raw-header/direct-socket middleware. It requires exactly one raw idempotency key, validates the supported purpose and observed cookie grammar before throttle/reservation, and derives the bootstrap-origin scope with a dedicated HMAC key after validated origin evidence. The purpose is included in the canonical request digest. The runtime and type constraints admit `browser-bootstrap-origin` only for `createV2BrowserNonce` over web; existing authority kinds and operation behavior remain available.

Reservation occurs before nonce issuance. Completion settlement occurs before setting the cookie or sending the nonce body. Duplicate reservations and issue/settlement failures produce generic responses without returning either secret; the best-effort failed settlement leaves the key burned. The response body contains only the public nonce, and the cookie is host-only with configured Path, Secure, HttpOnly, and SameSite=Lax. `/v2` no-store/no-cache middleware precedes route handling, and the logger's serializers omit headers/body while redacting cookies and bodies.

The development route is conditionally registered through explicit validated configuration. Its separate flag defaults off, requires development plus the broader v2 flag, and requires two distinct decoded 32-byte keys and existing origin/cookie config. Disabled mode keeps the route absent. No production enablement is introduced.

The reviewed tests now cover registered HTTPS cookie round-trip and prior-chain invalidation using the actual guard, registered-route per-origin throttle rejection without secret output, disabled-route 404, and the relevant transport, origin, purpose, cookie, duplicate-header, cache, and replay failures. Service tests cover global throttle capacity/window behavior, unknown origins, failure settlement/issuance and reservation burn, cookie validation ordering, and chain behavior. Root reports the full API lane passed (22 files, 330 tests), typecheck passed, and lint was running; I did not independently rerun these checks.

No blocking security finding remains. The report makes no claim that local HTTP Secure-cookie headers prove browser acceptance on IP-loopback; the test source documents this limitation.

## Exact source hashes reviewed

SHA-256 values at final review time:

- `apps/api/src/auth/browser-nonce/browser-nonce-http.ts`: `c11477bf98ab409dfba47b44e83386b9e790160c784b34e4adb0b73f81b30ffe`
- `apps/api/src/auth/browser-nonce/browser-nonce-http.spec.ts`: `a97d1fc6f1ed3323a1ddeef659dad9ae9d9705b92fc03f9dadd1f11a07cc9580`
- `apps/api/src/auth/browser-nonce/browser-nonce-http.module.ts`: `ace17cec136fc0a7218fcacee366d2b41a692e68cfb0f1563c6b231dc52b01cb`
- `apps/api/src/auth/idempotency/idempotency-guard.ts`: `ef5e693135faba75e13a8f8c65ab82326e886dcb45c2693058d36c8580cd2aad`
- `apps/api/src/auth/idempotency/idempotency-guard.spec.ts`: `e7a54d139f00a1dc6562ffe9306c528236f8badb2998ce8afa25849bfea3d21c`
- `apps/api/test/browser-nonce-http.spec.ts`: `b5a6300716fc85990954eae03078ec1b7370460d0d304e43f442bcc9a9588c4a`
- `apps/api/src/app.module.ts`: `62fdac1887ed90366f0170e6af2ca895b2e4f30535f4cb4f154f8f2e855d650f`
- `apps/api/src/config.ts`: `0aa37d9dca9f317a92deae4040e6131fc4de5e834288cad0670cff9ca3737229`
- `apps/api/src/config.spec.ts`: `c33162e897b424dc5ae34b2a38a6dfbb9594a3c757ff91a77e504ab31d08c92d`
- `apps/api/src/main.ts`: `b234ba0b862d8d53f0a80d6a98b72f196eeb971c5447981b8f26660672995fd4`
- `apps/api/src/auth/http/v2-browser-context.ts`: `39ba77f29cda731da458c23a8e424bda20f257493226bc68a2b09e7de3cbc813`
- `apps/api/src/auth/browser-nonce/browser-nonce.ts`: `d76c95d50ccf8eacbd463b967a3db037d06fe7c7bf582dcd6b4f79a1e5d38864`

Any later change to these files requires refreshing the affected hash and a focused reread. This approval covers the reviewed development-only source behavior and its stated limits only.
