# ST177 implementation decision

Status: concrete development reference design for the accepted ST176 `maina97b2ae` contract; no runtime code was changed. Independent security review remains required before implementation, as ADR-0010 requires before runtime work.

## Scope and contract

- Add a development-only, web-only adapter for the existing `OtpProofProducer` at `POST /v2/auth/otp/start` and `/verify`; retain OpenAPI operation IDs and request/response schemas unchanged.
- Require `transport: "web"`. Reject `mobile` and malformed transport with generic `400 AUTH_RESTART_REQUIRED`/problem response; do not silently fall back. Mobile support is a later task.
- Start accepts exactly `channel`, `identifier`, `purpose`, `transport`; verify exactly `challengeId`, `code`, `transport`. Use shared `packages/contracts/identifiers.ts::normalizeIdentifier(channel, identifier)`, then hash the normalized value with SHA-256 for the producer and a keyed HMAC digest for rate limiting. Never echo or log the identifier.
- Start returns `202 { challengeId, status: "accepted", nextBrowserNonce }`; verify returns `200 { purpose, proof, nextBrowserNonce }`. Include generic problem responses per OpenAPI, `Cache-Control: no-store` and `Pragma: no-cache`. No principal, session, login proof, or delivery/account-existence claim.

## Browser authority, idempotency, and rotation

- Reuse the exact `BrowserNonceGuard` instance used by `BrowserNonceHttpService`; refactor `BrowserNonceHttpModule.register` to construct/provide one guard token to both bootstrap and OTP modules. Current bootstrap service creates its own guard, so module wiring must change before the bridge is valid.
- Add `BrowserNonceGuard.validateBound(purpose, evidence, nonce, cookie)` as a non-mutating preflight. It validates canonical configured Origin, direct TLS/explicit loopback development evidence, nonce/cookie formats, hash pair, purpose, chain record and expiry; it returns an opaque trusted context containing chain ID and origin. It reveals no nonce-store data to HTTP callers. Add the corresponding synchronous store lookup; do not implement this by consuming/rotating.
- On the single Node process event loop: validate exact request/header/body shape and rate limits; preflight the nonce; derive the branded `browser-chain` idempotency authority digest from its validated chain ID; synchronously `reserve` using operation, web transport, canonical body digest and supplied key; then synchronously `consumeAndRotate`. Since preflight, reserve, and consume/rotate contain no `await`, no competing handler can interleave in this process. The consume transition revalidates the same nonce/cookie/origin/purpose/expiry atomically; failure settles reservation failed and returns generic conflict. No caller-controlled value may be cast to `TrustedAuthorityDigest` before preflight.
- After rotation, call producer with server-derived `{transport:"web", exactOrigin, browserChainId}`. A committed challenge/proof is never replayed: duplicate idempotency reservation gives generic `409 AUTH_RESTART_REQUIRED`; errors after nonce consumption require a fresh bootstrap chain. Return `nextBrowserNonce` from rotation.

## Development controls and wiring

- Add `AUTH_V2_OTP_HTTP_ENABLED`, default false. Startup validation rejects it unless `NODE_ENV === "development"`, `AUTH_V2_ENABLED === true`, browser nonce is enabled, and all required v2 keys/origins are valid. Explicitly reject `NODE_ENV=test` and `production`; no config can override that. This is a new fail-closed dev-only bridge gate, separate from the existing delete-OTP gate.
- Construct `OtpProofProducer` with `InMemoryOtpChallengeRepository`, `ProofStore(InMemoryProofRepository)`, and required dedicated >=32-byte `AUTH_V2_OTP_HMAC_KEY`; use existing required idempotency configuration/repository and shared browser guard. Do not use the v1 OTP service/inbox.
- Add a bounded process-local test/development code sink indexed by opaque challenge ID, retaining code only until challenge expiry (5 minutes), max 10,000 entries; prune expired entries and reject at capacity. Expose read access only to an injected test harness API, never an HTTP route. No stdout/log output, raw identifier key, provider delivery, persistence, or production binding.

## Throttling and proof limits

- Before nonce consumption, enforce bounded in-memory sliding windows: at most 10 starts per direct socket IP per 60 seconds and 5 starts per HMAC(normalized identifier) per 15 minutes; max 10,000 active buckets, prune expired buckets, fail closed with generic `429` on capacity. Also cap each IP at 60 start/verify requests per minute. Never read `X-Forwarded-For` or other forwarding headers; use normalized `request.socket.remoteAddress` only. Hash IP and identifier bucket keys with a dedicated configured rate-limit HMAC key; never retain raw values.
- The producer itself limits codes to five attempts and consumes successful challenges atomically. Proof purposes remain only `enrollment` and `stepup`; neither may establish login or select/create identity. Existing ST170b remains required for any future session exchange.

## Implementation boundary and remaining gate

Allowed code paths: `apps/api/src/auth/browser-nonce/`, `apps/api/src/auth/http/`, `apps/api/src/auth/proofs-v2/` only if an adapter seam is necessary, `apps/api/src/auth/otp/` for a new v2-specific sink, `apps/api/src/app.module.ts` for wiring, and config. Do not change v1 behavior, database schema, OpenAPI fields, provider protocols, or deployment settings. Security/privacy review must inspect the nonce peek-to-reserve-to-rotate ordering and dev gate before code is authorized; no unresolved product decision remains in this reference design.

Conductor corrections: APIchannel sms maps explicitly to shared normalizer channel phone; email stays email. Add only local workspace dependency @subtrack/contracts/identifiers to apps/api/package.json and pnpm-lock.yaml using pinnedpnpm12; no external dependencies. Verify body lacks purpose: derive it from server-owned challenge metadata retained in the bounded challenge repository/sink, never requestJSON; validate nonceagainst that purpose and producer-bound chain. Keep challenge/proof repositories bounded and prune expired records, not only the code sink. Complete idempotency settlement before exposing nextBrowserNonce/challenge/proof or making a code available to the test sink; failure burns key/nonce and emits no secrets. Unknown challenges return a generic failure without consulting users/accounts. Code sink has no public retrieval API or logs, injected harness access only, explicitly no delivery claim. Dedicated OTP/rate HMAC keys must be32bytes and distinct decodedbytes from eachother and existing idempotency/origin keys.
