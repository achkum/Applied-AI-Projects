# ST-126d source review

**Decision: APPROVE — frozen private source scope only.** The reviewed implementation matches the accepted local Type 2b plan and remains a private, deterministic ID-only findings helper. This review does not approve full ST-081/ST-126 integration, production sufficiency or confidence, or broader task completion.

## Frozen source hashes

- `packages/domain/detection/amount-anomalies.ts` — `45c6d5d381648b4c4e1edb9fd6739bec3545c1c55282dd93886ffeec07337069` — match.
- `packages/domain/test/amount-anomalies.spec.ts` — `f9cc96fbd5544199907c50622cb5f051483fdca482d45ac7a8fd9849d293d935` — match.
- `packages/domain/detection/amount-anomalies.md` — `6577071f1d34493820d24fc791fafd4fecd854b767b76473d9a49a56773bce65` — match.

## Findings

No source blocker found within the frozen scope. The helper makes one call per valid candidate to the accepted `@subtrack/money` `isAmountOutsideMedianMad` primitive, delegating Money validation and all monetary arithmetic. It does no monetary coercion or calculation in the domain helper. Its limits are explicit: at most 1,000 charges, 1,000 references per charge, and 10,000 captured reference entries per batch. It captures array lengths, copies histories by index before calling Money, catches malformed values/getter and primitive failures behind the fixed generic error, rejects duplicate or invalid IDs, and returns no partial findings. Findings expose only frozen transaction-ID/reason objects in deterministic prefix-safe Unicode codepoint order; the result array is frozen as well.

Caller obligations remain authorization and owner scope, posted-debit filtering, service/subscription grouping, chronological reference selection, homogeneous currency, and candidate exclusion. Those are documented and are not inferred or implemented here. The primitive's ordinary median/MAD, strict outside-bound comparison, even-sample fractional handling, huge bigint behavior, and literal singleton/zero-MAD semantics are covered by Money-level tests; the domain tests exercise delegation with odd/even boundaries, negative values, huge amounts, malformed Money and currency mismatch.

## Limits and evidence

This is a source review, not a rerun of tests or CI. Root-reported QA evidence records 153 domain tests across 9 files, 13 new cases, actual helper branch coverage 33/33, all helper metrics at 100%, and lint/typecheck/build passing. The accepted ST-126c receipt records accepted main `3088b9273861a0d0bf9791d7db113d0230ec1aa2`, PR 212, and all 35 actual CI steps successful. The local source remains a helper only: no index/package/default/API/database/schema/provider/UI wiring, and no claim of completing ST-081/ST-126.

Review basis: repository `AGENTS.md`, Constitution, AI/ML spec §5, `.sdlc/tasks/ST-126d.md`, `.sdlc/evidence/ST-126d/architecture-plan.md`, accepted ADR-0014, ST-126c accepted-main receipt, the three frozen source files, Money implementation and its median/MAD tests.
