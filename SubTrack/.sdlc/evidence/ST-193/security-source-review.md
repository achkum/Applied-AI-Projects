# ST-193 security source review

**Decision: Approve.** The frozen implementation satisfies the approved Type 2a security plan. I found no blocking source-level security or privacy issue in the four reviewed files. This decision covers the scoped development HTTPS bridge; it does not attest production readiness or full transaction/socket atomicity.

The module is explicitly opt-in for development with exact HTTPS origins, a distinct binding-cookie name, copied 32-byte authority key, and captured trusted ports. Runtime refresh authority comes from the stored refresh credential and binding scope; the naturally sent access cookie is ignored. Direct TLS and canonical origin are required. Raw duplicate headers/cookies, query strings, body content/framing, Authorization, mobile nonce, and alternate CSRF headers fail before reservation or rotation. No-store errors cover parser failures.

The source uses the explicitly approved consumed-history scope only to verify CSRF. It checks CSRF before reservation; the shared refresher remains responsible for atomic rotation/reuse revocation and revalidates ownership/transport. The browser-chain digest is framed and scoped, while idempotency stores only operation digests and token hashes. After rotation, the new JWT principal and current owned row/hash/binding/lifetime are checked before CSRF minting and response publication. Known pre-header failures conditionally revoke only the exact returned issuance and invalidate CSRF only on confirmed removal; unknown outcomes are not guessed, and sent headers are not undone.

No provider, default runtime wiring, client behavior, or durable-store claim is introduced. The specs exercise the real in-memory session-to-refresh pipeline and actual HTTPS registration/default 404. Review is limited to these four files and the supplied frozen-source fingerprints; I did not rerun the test suite.

| File | SHA-256 |
|---|---|
| apps/api/src/auth/sessions-v2/v2-web-refresh-http.ts | 0976072ce8fe2d672d9f8b3b256e9d19e1a879b389a7b30ef9d34992d1c263a2 |
| apps/api/src/auth/sessions-v2/v2-web-refresh-http.module.ts | e32c069703c010bfb2fcc626f507250279d12a21d3dc9fc486b4e3aee7be26f1 |
| apps/api/src/auth/sessions-v2/v2-web-refresh-http.spec.ts | b1f0345d91e734cf6a9d476a606dc4f9e2c82f13f48f4b8a2154f917ac202d6d |
| apps/api/test/v2-web-refresh-http.spec.ts | 799dc116ec82721e005105e72ddbe6da1f3889f8da9bb89d0a3a8b1c196b4774 |
