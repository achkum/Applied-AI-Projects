# ST-209 independent platform source review

```yaml
contract: REVIEW/v1
task_id: ST-209
reviewer: architect-platform
verdict: APPROVE
findings: []
```

This source verdict is bound to these SHA-256 hashes, reviewed on 2026-10-10:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/auth/proofs-v2/otp-proof-producer.ts` | `D7ABAA96E5393FBD36AE80A5ABAE67201DCA722015493B2B11B5ACB40AF56D08` |
| `apps/api/src/auth/proofs-v2/otp-proof-producer.spec.ts` | `6DB6509129B23D4293BAC0351E66CF9D66357E8D08199E1D1F2A2183957B00E7` |
| `apps/api/src/auth/proofs-v2/mobile-enrollment-challenge-store.ts` | `2D42D659B56F1EA318019448295A683F7D5A9E3F716710433C1B7FC7256A1511` |
| `apps/api/src/auth/proofs-v2/mobile-enrollment-challenge-store.spec.ts` | `4DFC608D7AA2CF6D00D8C34DEFA4BD61FF69B4AC771F4C7BF765AF161A04ED1C` |

I read the repository instructions, governance Constitution, TEAM, DECISION_RULES, QUALITY_GATES and AGENT_CONTRACTS, ST-209, ADR-0010/0020, the producer, proof store, new metadata store, relevant specs, and the existing OTP caller and contract. The reviewed diff confines production source changes to the producer and the new process-local store. Legacy `provision` and `verify` implementations and their output shapes are unchanged. The optional specialized repository method leaves existing repository implementations compatible and mobile verification fails closed when it is absent.

Mobile provisioning accepts only the normalized identifier hash and channel. It constructs one challenge record, awaits its insert, checks time again, then projects frozen issuance fields from that same record; the code is returned separately for the test-only sink. The in-memory specialized repository atomically increments incorrect attempts, returns four retryable outcomes, retires the fifth failure, and consumes a correct challenge before reporting its stored record. Mobile verification snapshots expected issuance before the repository await, checks every issuance field against the consumed record and verifies the code digest before issuing only an enrollment/mobile/challenge/identifier-bound proof. It checks safe monotonic time after the repository and proof-store awaits; exceptions and malformed outcomes disclose no proof. The proof store's action binding prevents this proof from serving login, account deletion, or session authority.

The metadata store reserves a capacity slot before issuance and counts pending plus published records against its 10,000 limit. Publication validates the full tuple, lifetime, slot and code, and installs metadata plus test-only code in one synchronous transition. Lookup and claim expose metadata without code. Claim immediately makes the row unavailable across awaits. Only an explicit decreasing incorrect-attempt result can restore it; retirement removes both metadata and code. A cleanup fault leaves the claimed row unusable until expiry. The store rejects regressed, invalid and overflow clocks, and expiry is exclusive. The focused specs exercise tuple tampering, attempt limits, concurrent consumption and slot races, post-await clocks, malformed publication, and no revival after cleanup failure.

The implementation handoff reports 50 focused tests with coverage, API lint and typecheck, and 1,206 full API tests passing. I relied on that recorded validation and performed a source review; I did not rerun tests or CI. No blocker or major platform finding remains in these four files. This approval does not establish an HTTPS adapter, idempotency settlement ordering, HMAC-key separation, wire behavior, default or production registration, provider delivery, database durability, deployment readiness, or runtime availability. The subsequent adapter must enforce those ADR-0020 gates, including settlement before publication or proof disclosure and terminal cleanup on consumed or ambiguous outcomes. Independent security, QA and exact-head CI remain separate Conductor gates.
