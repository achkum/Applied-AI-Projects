# ST-190 security and privacy source review

Decision: **APPROVE**

Reviewed exact source:

- `apps/api/src/auth/sessions-v2/v2-session-issuer.ts` — SHA-256 `a774456bfbb40355cf24f7221f9cb79706217c09a5a43f4f63e93c3f3ac78841`
- `apps/api/src/auth/sessions-v2/v2-session-issuance-clock.spec.ts` — SHA-256 `da5b79e99f08e37e5a0371cf3a07cac909dc6103a4c9b732a7ea3eb01c7d4e17`

The issuer captures a safe, bounded `before` timestamp before awaiting `consumeLogin`. After validating the consumed proof result, it captures the trusted `now` and rejects when `now < before`, using the existing generic `Session unavailable` failure. This check is before context assignment and all UUID generation, random-byte generation, repository insertion, and access-token signing. The existing `validClock` checks preserve the timestamp bounds. The catch path does not restore a consumed login proof; the proof remains one-use on clock regression.

The current tests use delayed redemption backed by `ProofStore` and `InMemoryProofRepository` for both web and mobile. The 1 ms and large regressions assert generic failure, zero UUID/byte generation, zero insertion, zero signing, and proof non-reusability. Equal and increasing clock cases verify successful issuance with a real Ed25519 signer and current-owner principal resolver. No test result is claimed here; the task owner reports the full API suite, lint, typecheck, and build passed.

No security or privacy finding requires a source change. This approval applies only to the two exact source hashes above and the narrow ST-190 post-proof clock regression fix. No API, model, or lifetime policy changes were reviewed or authorized here.

Review accounting: the initial review used 4 tool calls total (3 source/guidance reads and 1 artifact write). This corrective review used 2 exec calls (updated test read/hash and artifact refresh); handoff is separate.
