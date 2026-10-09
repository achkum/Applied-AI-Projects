# ST203 security plan review

## Decision

**Classification: Type 1 (security-model decision). Plan disposition: BLOCK pending a separate explicit founder decision for ST203.** The verify operation consumes a one-use challenge and returns an account-delete-only proof, which is a security capability. ADR-0010 accepts the contract only and calls for separate runtime/security review; ADR-0012 and its founder receipt expressly approve `/start` only and exclude verify/delete. The earlier ST201 Type 2a review and founder approval cannot authorize this capability. DECISION_RULES §1 and D-12 require the founder to resolve uncertainty about a Type 1 security-model change. No inherited approval is established by the OpenAPI operation, accepted proof core, or this review. If the founder separately approves this bounded verify scope, this review finds the proposed controls adequate for implementation planning, subject to the requirements below and source review.

## Security assessment

The proposal is well bounded: it reuses the existing mobile Bearer principal, current owned session, registered-contact resolver, deletion-only proof producer, and non-replay idempotency guard. It keeps the adapter in an explicitly registered development-only module and excludes default wiring, real delivery, providers, database/schema work, clients, production exposure, and deletion. Those boundaries must remain exact.

The strict no-cookie, single Bearer, direct-TLS transport and exact framing/body requirements address credential ambiguity and request smuggling risks. Resolve authority from the trusted resolver and server-side contact, and keep caller data limited to challenge ID and code. The 43-character canonical challenge ID and six-digit code match the proof core. Uniform generic failures must reveal no challenge existence, attempt count, contact, code, proof, or trusted-port detail. Avoid logs or idempotency state containing code/proof/PII; hash the canonical request and ensure the guard only retains its keyed binding, never raw inputs.

Ordering is safety-critical. Validate transport and body before throttle/reservation/core work; throttle before reserve; reserve before verification; then revalidate claims and the full owned current session synchronously immediately before the single `verify` invocation, with no intervening await. The accepted producer consumes the challenge before awaiting proof issuance, and a failed proof issue leaves it consumed. Recheck current ownership after that await and immediately before disclosure. Settle only the owned reservation synchronously, never overwrite completion, and never replay a proof. Response loss or any uncertain post-verify outcome requires a fresh challenge; no cleanup, retry, or rollback can be assumed across the challenge store, proof store, idempotency guard, and HTTP response.

The plan correctly treats hostile ports, thenables/getters, capacity failures, parser errors, and response failures as fail-closed cases, and its actual-CA HTTPS matrix covers the main leakage, race, replay, and revocation risks. Preserve generic responses and no-store headers even on parser/error paths. The adapter throttle supplements the producer's wrong-attempt bound and must not let new idempotency keys bypass that core budget.

## Conditions after the decision gate

- Record the founder's explicit ST203 Type 1 decision before implementation; this review is not that approval.
- Keep the exact development gates, opt-in module registration, mobile-only Bearer branch, existing resolver/proof/idempotency components, and existing OpenAPI contract. Any change to authority/proof semantics, default wiring, production/public exposure, providers, deletion behavior, or contract requires renewed classification and review.
- Implement the specified synchronous pre-call and post-await ownership checks and non-replay behavior. Do not imply atomicity or attempt guessed cleanup after a partial commit.
- Complete independent source review and the proposed real-CA HTTPS adversarial checks before merge; any High/Critical finding blocks merge absent a written founder override.

References reviewed: `DECISION_RULES.md` §§1–2; `CONSTITUTION.md`; ADR-0010; ADR-0012; ST201 founder approval and security plan review; ST203 proposal; OpenAPI verify operation/schema; accepted deletion OTP proof producer and mobile authority resolver.
