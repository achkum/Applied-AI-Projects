# ST-179 platform preimplementation review

Verdict: **APPROVE WITH REQUIRED CONSTRAINTS** for the exact internal redemption design in `.setup/ST179-task-draft.md`.

The boundary is appropriately narrow: `consumeLogin(secret, transportContext)` returns only a frozen generic invalid result or the identity already stored in a valid login proof. The caller cannot choose identity, challenge, purpose, or action. This fits accepted ADR-0010's proof-purpose separation and makes no session or HTTP claim.

Required implementation constraints:
- Keep `compareAndConsumeLogin` optional on `ProofRepository` so existing generic fixtures/adapters remain compatible. Its absence must fail closed; never fall back to generic `compareAndConsume`.
- In-memory validation, comparison, and deletion must be synchronous in one operation with no `await`; return the stored canonical registered UUID only after deletion. Durable adapters remain future work and must provide atomic compare-and-delete.
- Snapshot transport context once from own enumerable data descriptors into a null-prototype record. Reject symbols, accessors, hidden/inherited/extra fields and malformed origins/chains before repository access. Keep the local context type structurally compatible without runtime/type dependency on OTP producer.
- Require stored `purpose === 'login'` and `action === ACTIONS.login`, exact transport binding, exact HTTPS origin and nonempty browser chain for web, and no web fields for mobile. Validate canonical UUID, nonempty server challenge, safe integer issue/expiry, no future issue time, unexpired proof, and exact TTL. Malformed records must not consume an otherwise valid proof.
- Validate strict `v2.` plus 43-character base64url secret syntax, finite safe clock, and adapter return shape. Catch repository errors and return generic invalid; do not log secrets, identity, or detailed errors.
- Preserve existing generic `consume` semantics and max-record/pruning behavior. Add no HTTP, session, database, schema, provider, barrel, environment, or production wiring.
- Tests must cover real ST-178 simulator-produced web/mobile proofs, replay/concurrent one-winner, wrong binding without burn, non-login purposes, corrupt metadata, invalid inputs and adapter failure, and prove invalid contexts are rejected before adapter work with no PII/raw secret exposure.

Evidence reviewed: SubTrack `AGENTS.md`, Constitution, ADR-0010, the ST-179 draft, current `proof-store.ts`, ST-178 platform/security source reviews, and the simulator producer. ST-178 reviews approve its internal fixed-fixture development boundary and descriptor snapshot hardening; neither asserts full QA or production readiness. This approval is limited to the described ST-179 design.

Review activity: 4 tool calls total, including this artifact write. No source/Git edits and no QA executed.
