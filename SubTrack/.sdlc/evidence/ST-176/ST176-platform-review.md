# ST-176 independent platform review

**Verdict: APPROVE — platform scope, against the reviewed source snapshot.** I found no platform blocker in the development-only registered route. This is not security/privacy sign-off, exact-head CI, a production readiness claim, or browser cookie acceptance evidence.

## Reviewed source and contract

Reviewed source at repository HEAD `6d612007bf52f1ad6f8d193667a630b9d21277a2`, including the uncommitted ST-176 worktree changes. Task contract: `.sdlc/tasks/ST-176.md`; governance: `docs/governance/CONSTITUTION.md`; accepted API contract: `packages/contracts/openapi.yaml` `createV2BrowserNonce`; ADR: `docs/architecture/adr/ADR-0010.md`.

SHA-256 of reviewed implementation files:

| File | SHA-256 |
|---|---|
| `apps/api/src/auth/browser-nonce/browser-nonce-http.ts` | `c11477bf98ab409dfba47b44e83386b9e790160c784b34e4adb0b73f81b30ffe` |
| `apps/api/src/auth/browser-nonce/browser-nonce-http.module.ts` | `ace17cec136fc0a7218fcacee366d2b41a692e68cfb0f1563c6b231dc52b01cb` |
| `apps/api/src/auth/http/v2-browser-context.ts` | `39ba77f29cda731da458c23a8e424bda20f257493226bc68a2b09e7de3cbc813` |
| `apps/api/src/auth/idempotency/idempotency-guard.ts` | `ef5e693135faba75e13a8f8c65ab82326e886dcb45c2693058d36c8580cd2aad` |
| `apps/api/src/config.ts` | `0aa37d9dca9f317a92deae4040e6131fc4de5e834288cad0670cff9ca3737229` |
| `apps/api/src/app.module.ts` | `62fdac1887ed90366f0170e6af2ca895b2e4f30535f4cb4f154f8f2e855d650f` |
| `apps/api/src/main.ts` | `b234ba0b862d8d53f0a80d6a98b72f196eeb971c5447981b8f26660672995fd4` |
| `apps/api/src/auth/browser-nonce/browser-nonce-http.spec.ts` | `a97d1fc6f1ed3323a1ddeef659dad9ae9d9705b92fc03f9dadd1f11a07cc9580` |
| `apps/api/test/browser-nonce-http.spec.ts` (final wire test) | `b5a6300716fc85990954eae03078ec1b7370460d0d304e43f442bcc9a9588c4a` |

## Findings

- The nonce flag defaults off. Enabling it requires development plus `AUTH_V2_ENABLED`, valid shared v2 origin/cookie configuration, two 64-hex keys, and distinct decoded key bytes. Test and production are rejected. `appModuleFor` imports the narrow nonce module only when the validated flag is on; the broad auth module remains absent. Default disabled startup therefore does not need the added key fields.
- The registered route receives ST-175 middleware evidence from raw Origin/Cookie headers and the direct socket. That middleware requires one exact configured canonical Origin, rejects malformed/duplicate recognized cookie evidence, and checks direct TLS or explicit local-loopback HTTP without trusting forwarded headers. The controller rejects duplicate raw Idempotency-Key fields. The service checks the observed binding cookie against the 43-character base64url secret grammar before throttle, reservation, or nonce issue.
- The new authority kind is restricted by the reservation input union and runtime validator to `createV2BrowserNonce` over `web`. The adapter accepts only a configured origin through its fixed configured-origin throttle map before HMAC derivation; the HMAC has a dedicated domain prefix and a separate configured key. The canonical request digest binds purpose. Existing browser-chain and verified-principal inputs remain available for legacy operations and transports.
- Throttling is process-local, with a preallocated per-configured-origin bucket (60 requests per 60 seconds) and one global bucket (300 per 60 seconds); neither key nor state grows from request-controlled identities. Limits, expiry, and capacity rejection are visible in the focused specs and route test. Restart resets state, as documented by the task.
- Reservation occurs after throttle and before nonce issue. Successful issue settles `completed` before setting the cookie or writing JSON. Issue/settlement errors return a generic problem without nonce/cookie fields and attempt failed settlement. Repeated keys are generic 409 `AUTH_RESTART_REQUIRED`; no response replay path exists. A presented valid cookie is passed to the existing guard for prior-chain invalidation; the wire test inspects the actual registered guard state. Requests without a cookie create independent chains.
- Success returns only `{ nonce }`, sets the configured cookie with `Path`, `Secure`, `HttpOnly`, and `SameSite=Lax` and no `Domain`, and inherits `no-store`/`no-cache` across v2 responses. The integration test exercises HTTPS header round-trip by manually resending the cookie. As the task itself notes, that does not prove browser acceptance of Secure cookies on IP-loopback HTTP.
- Final receipt update: the only late source change reported by the task owner was the test stub's `type(contentType: string) { void contentType; return this; }`; I mechanically reread it and recorded the updated test-file hash above. The task owner reports API lint passing and a temporary real-Chromium HTTPS check passing for Secure/HttpOnly cookie acceptance, configured path inclusion/exclusion, absence when out of path, and a subsequent request returning 200. Temporary harness was removed with no dependency changes. These runtime checks are owner-reported, not independently rerun here. The earlier report of 22 files / 330 tests and typecheck passing also came from the task owner; I did not rerun them. This review did not alter application source.
- Final wire-test receipt: the task owner renamed the duplicate-operation test's local idempotency identifier from `key` to `requestId` to clarify that it is caller input, preserving its literal and request behavior. I mechanically reread the final wire-test source and recorded its exact hash above. The task owner reports the seven wire tests are rerunning; no result is claimed here.

## Scope boundary

This approval is limited to the platform implementation boundary. The source remains a process-local development reference and does not establish durable no-replay behavior, distributed abuse resistance, production readiness, or browser cookie-policy acceptance. Security/privacy review and exact-head CI remain required gates before merge.
