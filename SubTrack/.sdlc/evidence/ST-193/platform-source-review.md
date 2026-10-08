# ST-193 platform source review

**Decision: approve Type 2a** for the scoped development-only HTTPS adapter and explicit opt-in module. The implementation follows the accepted plan and preserves the ST-192 boundary.

The refresh cookie is parsed strictly and hashed before a synchronous, owner-scoped `webContextForRefresh` lookup. That scope supports CSRF verification, including retained consumed history, but is not treated as an active protected principal. CSRF failure precedes reservation and rotation. The shared refresher remains responsible for atomic credential recheck and reuse handling. Browser-chain HMAC input is domain separated and length framed with canonical Origin, identity, and session ID.

Publication requires the rotated result, resolved principal, current owned row, successor hash, web binding, and original expiry to agree. CSRF is minted from the resolved principal; row state is rechecked before reservation completion and the single two-cookie response. Known pre-publication failures use exact conditional family revocation and invalidate CSRF only on confirmed removal. Unknown commit state is not guessed; after headers are sent the handler does not claim rollback or socket atomicity. Default application wiring remains absent.

Focused and actual-TLS specs exercise the trust boundaries and real session-to-refresh chain. Review is source-only; I did not rerun QA, inspect Git/metadata, or validate runtime/provider readiness.

Frozen source SHA-256 fingerprints:
- `apps/api/src/auth/sessions-v2/v2-web-refresh-http.ts` — `0976072ce8fe2d672d9f8b3b256e9d19e1a879b389a7b30ef9d34992d1c263a2`
- `apps/api/src/auth/sessions-v2/v2-web-refresh-http.module.ts` — `e32c069703c010bfb2fcc626f507250279d12a21d3dc9fc486b4e3aee7be26f1`
- `apps/api/src/auth/sessions-v2/v2-web-refresh-http.spec.ts` — `b1f0345d91e734cf6a9d476a606dc4f9e2c82f13f48f4b8a2154f917ac202d6d`
- `apps/api/test/v2-web-refresh-http.spec.ts` — `799dc116ec82721e005105e72ddbe6da1f3889f8da9bb89d0a3a8b1c196b4774`

Review calls: 3 `exec_command` calls + 1 handoff = 4 normalized calls.
