# M5 next requirement proposal: duplicate-charge anomaly rule

## Disposition

**Recommended next slice: a local deterministic duplicate-charge rule, initially BLOCKED pending its input money boundary and upstream task status.** This is the smallest useful anomaly slice in AI_ML_SPEC §5: flag duplicate charges within three days for the same merchant and same amount. It has a defined threshold, needs no model fitting or service dependency, and leaves the other three anomaly rules and optional Isolation Forest for later. Do not describe the complete ST-126 dependency as satisfied.

The backlog still lists ST-081 as BLOCKED in its task contract, and ST-083 and ST-123 are BACKLOG. The ST-081 handoff names unresolved BigInt wire representation, lifecycle, feedback, RLS and ownership issues. ST-083 and ST-123 have no matching task receipt/source-inventory files in `.sdlc/evidence`; ST-123 explicitly depends on ST-083. No evidence reviewed here establishes their completion. ST-126 is listed as depending on ST-081, so the full task remains blocked by that dependency. A pure local rule can be independently implemented only after the criteria below confirm its caller supplies properly scoped, money-safe data; it cannot claim upstream integration or task-level dependency acceptance.

## Basis in the repository

- `docs/product/AI_ML_SPEC.md` §5 gives the duplicate rule, the three-day window, same merchant and same amount; it also lists cancelled-subscription charges and median ± 3×MAD, plus an optional Isolation Forest. This proposal covers only the duplicate rule.
- `packages/domain/detection/types.ts` currently defines `DetectionTransaction` with `id`, `accountId`, `date`, `amountMinor: number`, `currency`, `direction`, and `pending`; `TransactionSeries` carries `ownerId`, `accountId`, `merchantKey`, `currency`, and transactions. `packages/domain/detection/detector.ts` uses the local `detectRecurring` naming pattern and Money helpers.
- `packages/money/src/money.ts` represents amounts as `Money` with `minorUnits: bigint` and currency, and provides `equals`; `packages/money/src/index.ts` exports that API. The existing detection input's `amountMinor: number` is not a safe anomaly money boundary for large integer amounts. The new rule must not consume it or convert it with `Number`.
- `AGENTS.md`, the Constitution, and AI_ML_SPEC require bigint minor units via `packages/money`, deterministic money, owner-only transactions, and no PII. The function must receive already caller-scoped input and must not query or broaden visibility.

## Proposed contract

Private module API: `detectDuplicateCharges(charges: readonly DuplicateChargeInput[]): DuplicateChargeAnomaly[]`.

`DuplicateChargeInput` is a local input type with only transaction-derived fields required by the F9.2 rule: `id: string`, `accountId: string`, `date: Date`, `merchantKey: string`, and `amount: Money`. `Money` is imported from `@subtrack/money`; equality uses its currency-aware `equals` function. This boundary deliberately does not reuse `DetectionTransaction.amountMinor: number`. The invoking caller is responsible for supplying transactions already restricted to one authorized owner's scope, with canonical merchant keys and `Money` values created from exact integer minor units. No raw merchant description, account number, name, prompt, or other PII enters the helper.

Output: one result per unique unordered matching pair, shaped as `{ transactionIds: readonly [string, string]; reason: 'DUPLICATE_CHARGE' }`. Sort the two IDs stably and sort results by those IDs so output does not depend on input ordering. The helper returns identifiers and a fixed reason only; it does not expose amounts or merchant data.

Rule: flag two distinct records when their `merchantKey` values are equal, `accountId` values are equal, `Money` values are equal (including currency), and their UTC calendar dates are at most three days apart, inclusive. Restricting the set to one owner-scoped caller input prevents cross-owner comparisons; requiring the same account follows the existing transaction/account grouping boundary and avoids cross-account collisions for identical merchant and amount. Ignore no records based on subscription state or transaction narrative. Reject/return no findings for invalid dates or empty identifiers/merchant keys; do not silently coerce values. The exact invalid-input behavior should be encoded in tests and kept local to this helper.

The `accountId` condition is a privacy-safe grouping guard grounded in the existing transaction schema, not a new product signal. If architects determine F9.2 requires cross-account matching, that is a contract change and must be reviewed before implementation.

## Scope and classification

Type **2b (local)**: add a private helper under `packages/domain/anomaly/` and its direct unit test. Proposed maximum three paths:

1. `packages/domain/anomaly/detector.ts`
2. `packages/domain/anomaly/index.ts`
3. `packages/domain/test/anomaly-detection.spec.ts`

Do not export it through a new cross-package API, add a service endpoint, persistence, database/schema changes, model/registry, provider, dependency, defaults, UI, or production integration. If a consumer in another module needs a stable cross-module contract or new package-root export, stop and reclassify that surface as Type 2a before changing it. This is a local behavior proposal, not an assertion that ST-126 is fully unblocked.

## Readiness conditions and meaningful tests

Set the implementation task to **READY** only when the architect confirms the proposed caller-scoped `Money` boundary is available without changing `DetectionTransaction`'s numeric representation, and the Conductor records how the local slice relates to the still-blocked ST-081/ST-126 backlog dependency. Otherwise keep it **BLOCKED** with the exact unresolved boundary/dependency; do not invent task receipts or approve a substitute integration.

Tests must exercise: a same-account/same-merchant/same-currency and same-amount pair on the same day; pairs exactly three calendar days apart and just beyond the limit; different merchant, account, currency, or amount; same transaction ID; repeated and permuted inputs producing unique stable results; date crossing a month/year boundary; invalid dates and blank identifiers/merchant keys; and values beyond `Number.MAX_SAFE_INTEGER` to prove exact bigint equality. The new Money-using decision paths require 100% branch coverage under the Constitution. Assert the function does not mutate input records. No model card is applicable to this deterministic rule; document it as a rule if/when integrated into the broader anomaly task.

No tests, builds, model fits, network operations, or source changes were run or made for this requirements plan.
