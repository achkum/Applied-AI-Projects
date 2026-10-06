# ST170c2 security review

**Verdict: No security blocker identified for the integrated internal reference core.** The review covers the actual guard and focused spec in `apps/api/src/auth/idempotency/`, plus the supplied test, lint, and API TypeScript logs. The prior staged operation-list finding is resolved: source and spec include `createV2BrowserNonce` and reject `deleteV2Me`.

The core copies a mandatory HMAC key of at least 32 bytes, separates HMAC domains for idempotency-key lookup and binding, and length-frames the operation, transport, authority kind/digest, and canonical request digest. It stores only digests, expiry, and lifecycle state; owner handles are random 256-bit values and only their hashes are retained. Frozen records and snapshots avoid exposing raw key, authority, request digest, or response data. Synchronous reserve and settle preserve one-owner transitions within this process. Duplicate keys, wrong bindings, invalid/stale owners, exhausted capacity, and settled rows fail with the same generic restart error. TTL and capacity are bounded, expired records are pruned, and clock/expiry values are checked for safe integer bounds.

The focused test log reports 10 passing tests and coverage of 95.23% statements, 96.92% branches, 100% functions, and 98.21% lines. The task reports scoped lint and API TypeScript checks passing; the supplied typecheck log shows Prisma generation and `tsc --noEmit` completed without an error. I did not rerun checks.

## Boundaries

`TrustedAuthorityDigest` is an internal compile-time brand. Runtime validation checks the authority kind and digest shape, not who produced them. This core does not authenticate a principal, derive or verify the browser chain, or establish HTTP/bootstrap trust. Those remain separately reviewed adapter gates; the brand itself must not be used as an authentication boundary.

The implementation remains an in-memory reference. The repository interface documents the required atomic contract for future implementations, but this review makes no claim about durable or cross-process atomicity, production storage, deployment, provider behavior, or rollout readiness. No HTTP, cookie, CORS, CSRF, throttling, session issuer, or database integration was reviewed. The previous operation-list discrepancy was corrected and is not being treated as an accepted residual risk.
