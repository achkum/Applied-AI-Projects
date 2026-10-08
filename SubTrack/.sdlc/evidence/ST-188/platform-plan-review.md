# ST188 platform plan review

**Decision: APPROVE — Type 2a contract alignment.** Requiring the existing `BrowserNonce` parameter on web `POST /v2/auth/session` completes the browser chain already required by accepted ADR-0010; it does not change the security model. Keep the requirement conditional on web transport. Mobile remains idempotency-only, and v1 stays unchanged.

On successful web session redemption, atomically consume the submitted nonce and bind the login proof to the same trusted browser chain. Do not rotate or return a next browser nonce: the response establishes the distinct session-bound CSRF token, which takes over for subsequent unsafe cookie calls. A lost one-use response must require a fresh verified login and nonce-chain restart, reported generically as `AUTH_RESTART_REQUIRED`.

Implementation constraint: the current `BrowserNonceGuard` exposes `consumeAndRotate` and `validateBound`, but no consume-only transition. Do not describe `validateBound` as consumption or rotate then silently discard a nonce. Any runtime work must provide an atomic consume-only operation or equivalent store transition, with concurrency and failure behavior reviewed separately; ST188 itself remains contract-only and must not imply runtime readiness. Preserve exact Origin, distinct HttpOnly binding cookie, proof-chain matching, and generic failure behavior.

The proposed contract edits and regeneration fit the allowed ST188 paths. Keep ADR-0010 clarification limited to documenting its already accepted browser-chain rule. Required gates remain independent architecture/security approval, generated contract validation/tests/typecheck, gitleaks, and exact-head CI before merge.

Tool calls used: 2 (one batched read, one review artifact write).
