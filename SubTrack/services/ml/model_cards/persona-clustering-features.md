# Persona clustering feature construction and centroid review (partial)

**Status:** deterministic offline feature construction and centroid review; not an integrated persona or cohort feature.
**Implementation version:** 0.1.0.

## Offline centroid review primitive

`PersonaClusterer.fit` optionally accepts the closed marker `household-persona-v1`. A successful marked fit must have exactly the canonical 25 columns: the 22 category codes in domain order, `subscriptionCount`, `averageMonthlyPriceRelativeTo1000Sek`, and `annualShare`. The clusterer stores the marker and an immutable copy of these names. The marker is an upstream schema attestation; it does not inspect feature values to prove semantic order, authenticate a caller, or establish privacy. Generic fits remain supported and carry no schema metadata. A successful generic refit clears prior metadata, while failed fits preserve the previous fitted state.

`describe_persona_centroids` returns only immutable cluster IDs and canonical `(feature name, value)` pairs. It inverse-scales selected K-Means centers into their original dimensionless feature units. Category shares and annual share are bounded to [0, 1], count to [0, 10,000], and average-relative value to [0, 10,000,000]. It rejects absent or inconsistent fit metadata, non-finite results, and values outside these bounds. These are statistical review coordinates: the average-relative value is not currency, and counts and shares do not encode money amounts. The primitive performs no fit, prediction, logging, data access, or provider call.

The descriptions are not persona names, human-approved labels, or cohort statistics. This implementation makes no LLM, human-label, synthetic 5,000-household fit, integration, or product-quality claim. Focused tests have been authored but not run by the author; QA owns verification.

## Input and scope boundary

`buildPersonaFeatures` accepts at most 10,000 plain rows with exactly `category`, `monthlyMinor`, and `cadence`. Each category must be one of the 22 accepted codes in `docs/product/CATEGORIES.md`; each amount is a positive bigint from 1 through 1,000,000,000,000 SEK minor units. The caller must authorize and scope subscriptions and resolve currency and monthly normalization before calling. In particular, `monthlyMinor` is used exactly as supplied for both monthly and annual cadence. The builder accepts no identifiers, descriptors, account/contact data, transactions, or raw prices, and performs no authentication, database access, logging, provider/model calls, FX, or annualization.

## Feature order and encoding

The 25 dimensions are the 22 category spend shares in taxonomy order, followed by `subscriptionCount`, `averageMonthlyPriceRelativeTo1000Sek`, and `annualShare`. Shares and the average ratio are rounded half-up using bigint integer arithmetic at a fixed scale of 1,000,000. Category shares divide category monthly spend by total monthly spend. The average uses the `@subtrack/money` SEK `add` and `multiply` operations, with nearest-minor-unit average rounding, and divides that result by 100,000 minor units (1,000 SEK/month). The ratio remains unclamped: at the input limit its maximum is 10,000,000. Only bounded scaled dimensionless integers are converted to JavaScript numbers. Count is the raw integer row count. `annualShare` is annual-cadence row count divided by total row count, not a spend share. Empty input returns 25 zeros. Ratio rounding means category shares sum approximately to one within the accumulated rounding error.

The module snapshots validated primitive row values and returns a frozen vector; the exported category and feature-name arrays are frozen. This validation makes no claim that a caller is authenticated or that inputs were actually scoped.

## Evaluation and limitations

Focused TypeScript tests have been authored for schema order, arithmetic and rounding, empty and maximum row counts, malformed and excluded inputs, privacy-sensitive extra/accessor fields, and bigint aggregate values above JavaScript's safe integer range. These tests have **not been run by the author**; the parent agent owns the single verification run. No model training, 5,000-household training population, reviewed labels, cohort statistics, descriptor clustering, integration, or product evaluation is included. No clustering quality or budget claim is made.

## Conductor verification

22 focused tests and all105domain tests in6files passed. Domain lint, strict typecheck and build passed. The full V8 JSON report verified100% feature-module statement/function/branch coverage. These are deterministic implementation checks, not a household training or product quality evaluation.

## ST125e conductor verification

Full ML suite: 78 tests passed (18 centroid-description, 60 previous), with four existing dependency warnings. The final inverse-scaling expected value uses independent center*scale+mean arithmetic; no-fit/predict controls, exact domain-schema parity, mutation isolation, bounds, corrupted states and fit metadata/refit atomicity are checked. Initial author suite71 passed; root strengthened tests and enforces existing4..8cluster bound before final78pass run. No5kfit/LLM/human-label/cohort/product integration claim.
