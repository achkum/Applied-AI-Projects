# ST-199 security source review

**Decision: APPROVE**

The implementation stays within the reviewed internal development-only deletion OTP proof core. The trusted authority brand is an assertion boundary: runtime shape and complete challenge scope checks do not authenticate the caller or grant a principal. The core contains no mint helper, HTTP route, account deletion action, provider, or wiring. A future adapter must independently resolve the current v2 principal and its server-owned registered contact before constructing the assertion.

The challenge binds identity, session, identifier hash, channel, and transport context. The issued proof uses the existing `ProofStore` account-delete binding, including identity, session, identifier hash, challenge, and full transport context; the channel remains challenge state because `ProofBinding` has no channel field. The accepted proof store remains unchanged. Scope mismatches leave the challenge and attempt budget intact; successful verification consumes it synchronously before proof issuance, and issuance failure, malformed proof output, expiry, or clock regression after the await cannot restore the challenge or return a replayable proof.

The implementation and focused cases cover bounded attempts and start rates, challenge and rate-bucket capacity without live eviction, copied key material, strict descriptor-safe configuration and inputs, canonical proof validation, and hostile thenables without assimilation. No path authorizes deletion: the result is an opaque deletion-only proof for a separately reviewed future orchestration layer.

Source hashes reviewed:

- `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.ts`: `1224d4f12e3d751c46cec52221bd9b853ba0af7c3f8b05c5d6c7d3e3977ee227`
- `apps/api/src/auth/proofs-v2/deletion-otp-proof-producer.spec.ts`: `e0c124e240a87e7ff0a6bf4c14f42f0e3e70b18afaf3e11db7e94bf6ca865a66`
- `apps/api/src/auth/proofs-v2/proof-store.ts`: `047e682103646f9c68a64fd193be7581bf1dbc44df1fa823dbb97de49d4c6b78`
