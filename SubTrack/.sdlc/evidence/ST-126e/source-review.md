# ST126e frozen-source independent review

**Decision: APPROVE** the reviewed standalone converted-cost primitive and its documentation, limited to the accepted ST126e scope. I reviewed the implementation, barrel export, tests, and user-facing source documentation against the task, accepted ADR-0015, the accepted architecture plan/review, Constitution, and decision rules. I made no source changes and did not run tests or builds.

## Frozen source identity

| File | SHA-256 |
|---|---|
| `packages/money/src/converted-cost.ts` | `832c416bded5c293be785df87897e7d78cc5a6d5d3a34aa0e6aa6fe6e3822158` |
| `packages/money/src/index.ts` | `a32721ac2c8e9192775312e6b88a91801aaf09142ba12b27b64e6ae56336bab8` |
| `packages/money/test/converted-cost.spec.ts` | `b571dfb53e7100f07f83e04c99fb203d5981c9560f9ba7e042d4b72f86154713` |
| `packages/money/src/converted-cost.md` | `740332ce9d50ba432834b9f6cbcaa2550845905e644c231c0c56815e2c685e8a` |

## Findings

The core arithmetic implements the stated strict relative-distance rule correctly. It snapshots signed bigint minor units, takes magnitudes, reduces each positive settled/billed ratio, sorts with exact cross-products, and computes the ordinary median, including the exact mean of the two middle fractions for even histories. For candidate `n/d` and center `N/D`, `20 * abs(nD - Nd) > N*d` is precisely `abs(candidate-center)/center > 1/20`; equality is inside. Fractions stay positive because zero amounts are rejected before ratio creation. The 0–3 history path returns false only after all entries have been validated; 4–50 are accepted and 51 is rejected.

The currency and input boundary matches the contract: every billed and settled amount must be bigint and nonzero, currency codes pass the existing canonical validator, billed currency is USD or EUR, and the settled currency differs. Every history pair must match both candidate currencies. Pair fields and history length are captured once, history is copied into local fractions before sorting, and caught malformed input/getter failures become the fixed `MoneyError` message. No money arithmetic uses floating point or `Number`; use of ordinary `Number.isInteger` applies only to the bounded array length. The barrel change is additive.

The tests contain useful discriminating examples: both strict threshold directions and equality, even fractional median with exact boundary values, odd median, equivalent ratios and changed billed price, signed magnitudes without mutation, large bigint scaling, low/high history bounds, validation despite insufficient history, currency mismatch/invalid currency, frozen and permuted inputs, one-read getters, and fixed errors for throwing getters. In particular, raw lowercase currency is included, so the case where the normal Money factory canonicalizes it cannot hide the validation check. The EUR/JPY fixture exercises a currency pair with differing exponent conventions; common exponent factors cancel because the full pair is homogeneous.

The documentation and recorded assumptions correctly call the signal **effective booked conversion cost**, including fees, markup, and rounding reflected in settlement. It does not claim to isolate market FX movement or statistical confidence. Provenance, owner/service grouping, chronological reference selection, candidate exclusion, and posted-debit/refund eligibility remain caller-owned. No source integration, default wiring, absolute exchange-rate result, or automatic financial action is added.

## Limits

This is a source-level arithmetic and contract review. Runtime test results and the reported branch-coverage, Money-package regression, lint, typecheck, build, and CI results were not independently rerun here. Approval does not establish that the existing source pipeline supplies authoritative billed/settled pairs or complete ST081/ST126 integration.
