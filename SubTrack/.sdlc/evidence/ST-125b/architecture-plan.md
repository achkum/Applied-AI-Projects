# ST-125b deterministic feature builder plan

## Decision

Proceed with a local Type 2b implementation in `packages/domain/clustering/features.ts`, exported from `packages/domain/clustering/index.ts`, with a focused `features.spec.ts`. Add the `./clustering` package export and include `clustering/**/*.ts` in the domain lint script. This is a private deterministic upstream feature builder for the already accepted offline `PersonaClusterer`; it does not alter the ML core or wire it into product flows. No founder gate is indicated: this stays within F9.4, adds no dependency, contract, storage, or external exposure, and is reversible module-local architecture.

ST-125a explicitly scoped its own allowed paths to Python ML core/test/model-card/task files and excluded package/synthetic changes. ST-125b should have its own task contract granting only the domain clustering module, domain package export/lint configuration, colocated test, and an appropriate clustering model-card note or task/backlog documentation. Do not interpret ST-125a's exclusions as permission to implement package changes under that task.

## Public shape and privacy boundary

Use a narrow accepted input row such as `{ category: CategoryCode; monthlyMinor: bigint; cadence: 'monthly' | 'annual' }`. Each row represents one already scoped, accepted subscription. The caller must convert/normalize annual amounts and resolve currency before calling. This builder receives no transaction, household/user/member ID, account, merchant, name, descriptor, currency, date, or raw amount. It cannot authenticate scope; its contract says it accepts only caller-authorized rows. It performs no FX, annualization, database access, caller-scope resolution, logging, or model invocation.

Return an immutable, fixed-order numeric vector and a separately exported stable feature-name tuple/constant for the same order. Use the category codes in `CATEGORIES.md` in their listed order, then `subscriptionCount`, `averageMonthlyPrice`, and `annualShare`. Category shares divide category monthly spend by total monthly spend. `annualShare` is annual-cadence row count divided by total count, so it describes cadence composition, not annual spend. Empty input returns all-zero dimensions. Require every row to have a positive monthly amount and a supported category/cadence; reject zero/negative amounts and unknown categories. If product semantics later require zero-price subscriptions, resolve that explicitly in the task before changing this invariant.

## Deterministic arithmetic and bounds

Keep all money in bigint minor units, construct values with `money`, and combine amounts only with `add` from `@subtrack/money`. Require a single supplied currency only if the public row shape carries currency; preferably omit currency because callers provide amounts already normalized into one agreed currency, and document that precondition. Never call `toMajorUnits` or convert a Money/minor amount through `Number`.

The money package has no division/average API. For the required average feature, use `add` to form the exact total, then `multiply(total, 1n, BigInt(rowCount))` to perform the package's documented nearest-minor-unit rounding. The result remains Money. Do not silently annualize annual-cadence prices: the input's `monthlyMinor` is explicitly pre-normalized upstream, for both cadences.

For dimensionless model values, encode ratios to a documented fixed scale (recommend 1,000,000) with integer quotient/remainder rounding on bigint numerators and denominators, then convert only the bounded scaled integer to a finite JS number divided by the scale. This conversion is of a bounded dimensionless feature, never money. Clamp category spend shares and annual share to [0, 1]; encode average price as a documented bounded ratio against an explicit fixed monthly-minor-unit reference, clamped to [0, 1]. That reference is a feature scale, not a currency conversion or inferred monthly price. Reject overflow/unsafe scaling before number conversion. If the team cannot accept an explicit reference or the bounded average-price meaning, block feature design for an architect decision; do not invent a money formula or emit raw money as a numeric feature.

Set documented defensive caps (for example at most 10,000 rows, each monthlyMinor at most 10^15 minor units, and aggregate at most 10^18) and check before arithmetic growth; values beyond limits fail clearly. Also validate positive integer row count and output finiteness. Keep category order and ratio rounding/tie behavior stable. Freeze output arrays and feature names (or return readonly tuples with frozen runtime objects) so callers cannot mutate the vector or its schema.

## Required focused tests

Cover empty input; category share order and sums; count; average rounding through `multiply`; annual share and mixed cadence; upstream-normalized annual rows are used as supplied without hidden scaling; invalid category/cadence; zero and negative amounts; row, per-row and aggregate limits; stable repeated output and names/order; frozen output; all outputs finite and bounded; and a huge bigint case that proves no unsafe Number conversion. These tests validate this new deterministic behavior and do not claim household/product quality.

## Files and documentation

For the new ST-125b task, authorize only:

- `packages/domain/clustering/features.ts`
- `packages/domain/clustering/index.ts`
- `packages/domain/clustering/features.spec.ts`
- `packages/domain/package.json` (subpath export and lint inclusion)
- the relevant F9.4 model-card note or ST-125b handoff/backlog entry

Document that these features are a deterministic input builder for the offline clustering core, the upstream scope/currency/annual normalization preconditions, the exact dimension semantics and bounds, and that no privacy authentication or real-user evaluation is performed here. Keep ST-125a's core and model card's prior claims intact; this plan does not mark ST-125 complete.
