# ST126c frozen-source review

**Decision: APPROVE** for the four frozen files reviewed below. This is an independent source/math/contract review; it does not approve or attest to integration, release, or production use.

## Frozen files

| File | SHA-256 |
| --- | --- |
| `packages/money/src/median-mad.ts` | `c362210e7b3780aac2cc34e68d773a23b48be90a31eb961ed5e49381f3664ba9` |
| `packages/money/src/index.ts` | `795df7f338c3ac2f563f3eb27e88f35c1cc91ce03449094ec7f8314167a0f33c` |
| `packages/money/test/median-mad.spec.ts` | `49fb2489f3fcbf99ffefbd7345d09201fda6d24dcc0ef16e12208b3887cbde43` |
| `packages/money/src/median-mad.md` | `610749a6c1b767303155b6d276f9585d61d62c932988d09446df4ad4325070b7` |

The on-disk SHA-256 values matched the requested frozen hashes during review.

## Findings

The scaled-integer derivation is correct. `median2(values)` represents twice the ordinary median, including for even-length samples. With `m2 = median2(history)`, each `abs(2*x - m2)` is twice an absolute deviation; applying `median2` to those values gives `mad4 = 4*MAD`. The candidate expression `2*abs(2*c - m2)` is four times the candidate's distance from the ordinary median. Therefore `candidateDeviation4 > 3*mad4` is exactly the strict test `abs(c - median) > 3*MAD`. It preserves fractional even-sample medians and MADs without floating-point conversion or rounding, and works for negative and arbitrary-size bigint values. Equality at either threshold is inside.

Hand-calculated goldens agree with the implementation and cover the important median semantics:

- `[1,2,3]` has median 2, MAD 1, and inclusive bounds `[-1,5]`.
- `[0,1,2,100]` has median 1.5, MAD 1, and bounds `[-1.5,4.5]`.
- `[0,1,1,2]` has median 1 and deviations `[0,0,1,1]`, so the ordinary even-sample MAD is 0.5 and bounds are `[-0.5,2.5]`. The tests correctly keep integer candidates 0 and 2 inside and -1 and 3 outside. This corrects the lower-middle-only calculation preserved in an earlier plan-review draft.
- A singleton and zero-MAD samples follow the literal formula: the median is inside and every unequal candidate is outside.

The contract matches the task, accepted ADR-0014, AI/ML specification section 5, and the stated exact-money rules. History is an explicit caller-supplied array of 1–1,000 homogeneous `Money` references; candidate exclusion, grouping, chronology, authorization, and sufficiency remain caller responsibilities. Validation snapshots each amount and currency once, checks bigint amount shape and existing currency validity, and rejects mixed currencies. All thrown failures are normalized to the fixed `MoneyError` message. The implementation sorts a new bigint array, so it does not mutate history. The index change is additive and exports only the requested helper. The documentation accurately describes strict bounds, fractional exactness, singleton/zero-MAD semantics, and integration limits.

Tests include meaningful math boundaries and fractional MAD, negatives, huge translated bigint values, order invariance, frozen-input non-mutation, the history cap, malformed inputs, mixed currencies, getter failures, and fixed error behavior. The cases are directly tied to the contract and do not rely on floating-point goldens.

## Limits of this review

No source changes were made. I did not run tests, builds, coverage, lint, typecheck, secret scanning, CI, or inspect merge/live-environment state; those results are outside this source-review attestation. This approval does not establish runtime integration or statistical sufficiency. The helper has no consumer in this change, and caller integration must still define authorized service grouping, reference chronology, and minimum evidence policy.
