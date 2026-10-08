# ST-190 architect-platform source review

Decision: APPROVE

Scope reviewed: issuer clock check and new issuance clock spec only.

The issuer samples the trusted clock after awaited proof redemption and rejects `now < before` while preserving `validClock(now)`. The check precedes UUID generation, random bytes, repository insertion, and access-token signing. The catch path returns the generic `Session unavailable`; proof consumption has completed and is not reversed.

The revised tests use a real `ProofStore` and `InMemoryProofRepository`, issue correctly bound server-side login proofs, and delay the result after atomic consume. Both one-millisecond and large web/mobile regressions assert rejection, zero UUID/random calls, no session insertion, no signer call, and failed proof reuse. Equal and increasing cases use real Ed25519 tokens, a real in-memory session repository, and principal resolution.

No repository or Git state was changed. Root owns focused tests, lint, typecheck, and build; this review does not attest those results.

SHA-256 (exact reviewed source files):

- `SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: a774456bfbb40355cf24f7221f9cb79706217c09a5a43f4f63e93c3f3ac78841
- `SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuance-clock.spec.ts`: da5b79e99f08e37e5a0371cf3a07cac909dc6103a4c9b732a7ea3eb01c7d4e17

Tool-call count including initial review, corrective review, and handoffs: 6.
