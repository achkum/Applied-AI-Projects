# ST-170b2 security review

**Decision: approve the inspected source within the task's internal, development/test-only boundary.** This is a source review, not production approval. The architecture explicitly makes `OtpChallengeRepository` the trusted atomic compare-and-consume boundary; no production persistence or runtime wiring is present in this slice.

The producer requires and copies a 32-byte-or-longer HMAC key, uses a domain-separated digest bound to the challenge ID, and stores no raw OTP. Codes are generated uniformly from the six-digit range. The in-memory repository compares 32-byte digests with `timingSafeEqual`, checks expiry and transport context before recording a failed attempt, locks at five attempts, and consumes successful challenges synchronously. Web origin and browser-chain context are copied and frozen; origin validation accepts canonical HTTPS and loopback HTTP only.

After repository success, the producer checks returned metadata and derives only `enrollment` or `stepup` bindings from that record. It omits identity and session fields, consumes the challenge before proof issuance, and maps repository/proof failures to generic messages. The inspected tests now cover caller authority fields, context substitution without attempt burn, proof-purpose mismatch and replay, unsafe clocks, and malformed consumed records. I found no high or critical security defect in the reviewed boundary.

The previously noted clock-overflow edge is resolved: provisioning and verification require nonnegative safe-integer time, and provisioning checks that the computed expiry is a future safe integer. No actionable findings remain. The repository's atomic verification guarantee remains an implementation requirement for any future adapter; a future durable implementation needs its own review and validation.

Root reports 19 tests passing with 97.29% statement, 98.9% branch, and 100% function/line coverage, with lint and type checks still running at the time of this review. I did not run those checks and do not make a final QA claim.

Review steps: read the setup skill via `tools.skills__read({package:'c0/setup'})`, task and architecture notes, repository instructions and Constitution; inspected the current OTP producer, its spec, and `ProofStore`; re-read producer/spec for this final review. This artifact is the requested review output; no repository source was changed.
