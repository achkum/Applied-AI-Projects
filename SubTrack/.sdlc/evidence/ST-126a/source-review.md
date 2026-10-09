# ST-126a Independent Source Review

**Decision: APPROVE**

The three reviewed files match the frozen source hashes:

| Path | SHA256 |
|---|---|
| `packages/domain/detection/duplicate-charge-anomalies.ts` | `71438877582e24eb549ab5d0d16e4f96530039c3bd4b8cd2934a2ea0b5bc1fd2` |
| `packages/domain/test/duplicate-charge-anomalies.spec.ts` | `a8e2b818905523925c3e6446505f8974f4071abf93b80445abc4359ce5e9f09a` |
| `packages/domain/detection/duplicate-charge-anomalies.md` | `d2ba8060117a8ebc3d35467950ad4ccb8a8d472ad1ea777bf3ead894bb76ecaf` |

## Findings

- The helper requires caller-provided rows with account, merchant, and unique transaction identifiers and never fetches data or logs input. Its documentation assigns authorization, account visibility, debit filtering, and canonical merchant resolution to the caller. This supports privacy by default within the stated private-helper boundary.
- Amounts are checked for bigint minor units and a three-uppercase-ASCII-letter currency shape, then copied through the existing `money` API. Matching uses `equals`; there is no floating-point conversion or money arithmetic. Currency validation intentionally checks shape, not membership in the ISO 4217 registry.
- Matching requires the same account, merchant key, exact Money value including currency, and a UTC calendar-day gap of at most three inclusive. UTC calendar-day semantics, including cases longer than 72 elapsed hours, are explicit in the architecture plan, task assumption record, docs, and tests.
- Capacity is bounded at 1,000 inputs and 10,000 output pairs. Invalid inputs and capacity overflow map to the fixed generic error. Results are frozen at the array, object, and tuple levels; they contain only transaction IDs and a reason.
- IDs and output pairs are sorted by Unicode code point, and the nested-index iteration emits each pair once. Tests cover input permutation and supplementary Unicode ordering.
- The tests meaningfully cover date boundaries (including negative epoch), account/merchant/amount/currency mismatches, very large BigInt values, deterministic pair order, exact capacity limits, immutability, malformed inputs, and fixed errors. The implementation remains within the task's three-file boundary.

## Limits

This approval covers only the hash-pinned private helper, its tests, and its documentation. It does not establish authorization at a consumer, full ST-081/ST-126 integration, database/provider/UI behavior, or parent-task acceptance. Those remain pending as documented. Currency validation is shape-only by design.
