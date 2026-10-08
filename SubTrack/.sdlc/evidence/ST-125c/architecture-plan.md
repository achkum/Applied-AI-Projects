# ST125c plan review

**Decision: APPROVE_PLAN**
**Decision class: Type 2b (local module behavior).** The proposal uses the existing `@subtrack/synthetic` package and its existing domain dependency; it adds no package, dependency, schema, API, background job, or production path. `buildPersonaFeatures` and the clustering model semantics remain unchanged. This is an offline synthetic-input generator, not a security-model decision or a change to the clustering algorithm, so it does not trigger Type 1 or a security Type 1 review.

## Approved implementation contract

Implement only the proposed private statistical household generator in `packages/synthetic`, its focused tests, package export, task/evidence notes, and the offline population model card. It accepts only a strict plain config with `seed` (nonempty string, at most 128 characters) and optional integer `households` from 1 through 5,000 (default 5,000). Reject extra keys and accessors without invoking getters. Return a deeply frozen object containing the fixed `CLUSTERING_FEATURE_NAMES` and one feature vector per household. Generate each household from its own deterministic RNG derived from the seed and household index, so output for a given index does not depend on requested population size.

Each household contains an integer-random count from 2 through 20. Assign each generated subscription a canonical category, cadence, and positive monthly-normalized SEK minor-unit price. Choose prices only from the fixed illustrative list `[4900, 9900, 14900, 19900, 29900, 49900, 79900]`; do not calculate or perturb prices. Cadence is monthly or annual, with an independent fixed 20% annual chance using an integer draw. Since `buildPersonaFeatures` expects `monthlyMinor` already normalized, pass the selected table value unchanged for either cadence. These are toy illustrative monthly prices, not a verified market catalogue.

Use these exact category groups, containing only accepted canonical codes:

- media: `VIDEO_STREAMING`, `MUSIC_AUDIO`, `AUDIOBOOKS_EBOOKS`, `NEWS_MAGAZINES`, `GAMING`, `APP_STORE_BILLING`
- work: `SOFTWARE_PRODUCTIVITY`, `CLOUD_STORAGE`, `AI_TOOLS`, `VPN_SECURITY`
- household: `MOBILE_PLAN`, `BROADBAND_TV`, `FOOD_MEALKITS`, `TRANSPORT_MOBILITY`, `HOME_SECURITY`, `EDUCATION_KIDS`, `PETS`, `SHOPPING_MEMBERSHIPS`
- personal: `FITNESS_WELLNESS`, `DONATIONS`, `DATING_SOCIAL`
- other: `OTHER_SUBSCRIPTION`

Select one of five unnamed statistical templates uniformly per household. For each subscription, use that template's primary group with 70% weight, its secondary group with 20%, and broad category noise with 10%. Broad noise selects uniformly among all 22 canonical category codes. Template pairs are: media/work, work/media, household/personal, personal/household, and other/media. These are category mixtures only: do not add names, demographics, identities, family status, locations, banks, merchants, account or transaction history, descriptors, or sensitive-category unions. The template labels and explanation must state that they are sampling weights, not personas or claims about actual households.

For each household, construct transient `PersonaFeatureRow[]` values and immediately call the existing `buildPersonaFeatures`. Do not expose transient rows, prices, seed-derived identifiers, or other fields. Keep the output fixed to the existing 25 dimensionless feature names and vectors. Do not change domain feature construction, clustering preprocessing, model choice, k selection, or product wiring.

## Required evidence and boundaries

Focused tests should establish same-seed determinism, distinct-seed variation, prefix stability across population sizes, exact output dimensions and finite values, bounded count-derived features, meaningful category/cadence variation, deep immutability, and strict-config rejection including proving getters are not run. Test a small population only. Do not add a routine 5,000-row fitting test.

A single offline local evaluation on 5,000 generated households may fit the already accepted Python persona clusterer with one numerical thread and fixed seed/`n_init`. Record the actual selected `k`, silhouette, sample count, and cluster counts as descriptive synthetic evaluation only. Do not claim target quality, representativeness, ground-truth recovery, or real-household validity. The model card must identify the source as this lightweight statistical generator and its limitations; do not call it completion of the full ST063 synthetic-data generator or its banking-history requirements.

Do not add money formulas, providers, databases, network calls, raw banking data, default/runtime wiring, training automation, cohort-statistics claims, LLM naming, human label approval, artifact registry changes, or merchant-descriptor clustering. Keep the separate ST201 OTP HTTP and ST198 auth decisions blocked and untouched. Source work starts only after the stated ST125b main/all-CI prerequisite is satisfied.
