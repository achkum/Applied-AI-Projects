# ST-170c1 Security Review

## Result: approved for the internal development/test reference scope

The final source meets the reviewed core requirements. Bootstrap returns no chain ID; the ID remains in the internal record and is returned only as trusted context after matching verification and rotation. Nonce and binding-cookie secrets are independently generated, domain-separated v2 SHA-256 hashes are stored, and verification binds origin, purpose, cookie, and nonce with a fixed five-minute TTL and safe clock checks. The in-memory transition consumes and rotates synchronously; mismatch preserves valid state, bootstrap invalidates the prior cookie's chain, and generic failures avoid exposing details.

The origin concern from the prior review is retracted. `canonicalOrigin()` checks `u.origin !== value` before search/hash checks. For `https://app.example?` and `https://app.example#`, `URL.origin` is `https://app.example`, so the comparison rejects both. The focused spec now includes both cases. I found no remaining security blocker in the supplied source and spec.

## Scope and integration gates

Approval applies only to this internal core and its process-local development/test store. It does not establish production persistence or atomicity across multiple instances. The future trusted adapter must derive HTTPS and explicit loopback-development evidence from actual server transport and server configuration, without trusting unreviewed forwarded headers. It must serialize the binding cookie as `HttpOnly` and `Secure` and implement the remaining HTTP, CSRF, CORS, module, configuration, deployment, and persistence gates separately.
