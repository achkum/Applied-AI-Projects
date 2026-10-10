# ST-209 independent security source review

**Verdict: APPROVE_SOURCE.** No Critical, High, Medium, or other blocking source finding remains in the reviewed producer, challenge store, and adjacent specs. This approval is limited to the ST-209 internal ports; it does not approve an HTTP adapter, default or production registration, real delivery, native flow, or deployment.

Reviewed 2026-10-10 on `st/ST-209-mobile-enrollment-ports`, against accepted ADR-0020 and founder Option A. Source identity (SHA-256):

| File | SHA-256 |
| --- | --- |
| `apps/api/src/auth/proofs-v2/otp-proof-producer.ts` | `D7ABAA96E5393FBD36AE80A5ABAE67201DCA722015493B2B11B5ACB40AF56D08` |
| `apps/api/src/auth/proofs-v2/otp-proof-producer.spec.ts` | `6DB6509129B23D4293BAC0351E66CF9D66357E8D08199E1D1F2A2183957B00E7` |
| `apps/api/src/auth/proofs-v2/mobile-enrollment-challenge-store.ts` | `2D42D659B56F1EA318019448295A683F7D5A9E3F716710433C1B7FC7256A1511` |
| `apps/api/src/auth/proofs-v2/mobile-enrollment-challenge-store.spec.ts` | `4DFC608D7AA2CF6D00D8C34DEFA4BD61FF69B4AC771F4C7BF765AF161A04ED1C` |

I read `AGENTS.md`, the governance Constitution, team, decision and quality gates, ST-209 and its implementation evidence, accepted ADR-0010/0020, the four files above, the existing proof store, and the current web OTP caller. This was an independent source review. I did not edit implementation, run tests or CI, use a network or database, or change the branch. The author's implementation evidence records 50 focused tests, 1,206 full API tests, lint, and typecheck passing; independent QA and exact-head CI remain separate gates.

The dedicated provision method accepts only a normalized identifier hash and channel and projects the immutable seven-field issuance from the same inserted record. Verification snapshots the received issuance before its first await, compares all seven fields to the consumed repository record, verifies the code digest and mobile context, and issues only an enrollment/mobile/identifier/challenge-bound proof. The optional specialized repository capability fails closed when absent. Its in-memory atomic transition gives four decreasing retry counts, a terminal fifth incorrect attempt, and one consumed winner; the prior `provision` and `verify` interfaces and the existing web caller remain unchanged.

The producer's monotonic safe clock is shared across mobile calls and checked before mutation, after the repository await, and after the proof-store await. Regression, unsafe time, or five-minute expiry collapses to a generic failure without disclosing a proof; a proof inserted immediately before a late or failed final check can remain only as an undisclosed, expiry-bounded orphan. Repository and proof faults likewise disclose no secret or internal detail. The new specs cover tuple substitutions, concurrent consumption, five attempts, exact expiry, clock regression across both awaits, caller-owned issuance mutation, and legacy behavior.

The process-owned store counts pending and published slots together, at most 10,000, before issuance. Publication validates a complete issuance and six-digit test code, then makes metadata and code available in one synchronous transition. Lookup and claim expose only metadata; a claim makes the entry unavailable across awaits. Only a matching claim with a strictly decreasing explicit retry count can return it to active state. Retirement removes both metadata and code; failed cleanup leaves the claim unusable until bounded expiry. The code accessor is explicitly a test-only process boundary and has no HTTP caller in this change.

**Future adapter gate:** the ports deliberately do not settle idempotency, route requests, or prove an adapter passes the exact `{ issuance, code }` pair returned by one provision call. The adapter must reserve before producer mutation, settle before publication or proof disclosure, pass that pair intact, and invoke `restoreIncorrect` only for the producer's explicit incorrect outcome. It must retire terminal, consumed, and ambiguous claims even if cleanup fails. Adapter review and HTTPS fault/concurrency tests must establish those orderings and keep the test code accessor off HTTP. This approval makes no adapter authority or availability claim.
