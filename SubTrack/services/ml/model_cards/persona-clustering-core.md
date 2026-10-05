# Persona clustering core (partial)

**Status:** offline statistical core only; not an integrated persona or cohort feature.
**Implementation version:** 0.1.0 (package version); **seed:** 42 by default; **K-Means `n_init`:** 10 by default.

## Method and input boundary

`PersonaClusterer` accepts only a non-empty, finite, rectangular real numeric matrix. The upstream caller is responsible for authorization, scope, and constructing deterministic features. Input semantic scoping is the upstream caller’s responsibility; this component validates numeric shape/finite values and does not extract identifiers, transaction descriptors, account data or monetary features, or calculate spending. It standardizes the matrix with a fitted `StandardScaler`, fits scikit-learn K-Means for feasible `k` values from 4 through 8, and selects the largest silhouette score. Iteration is ascending and exact ties select the smaller `k`. K-Means uses a fixed random seed and explicit `n_init=10` by default. For more than 1,000 rows, silhouette scoring uses a deterministic sample selected with the same seed; candidate K-Means fits still use all supplied rows.

The fitted scaler and selected estimator are retained together and reused for prediction. `candidate_scores_`, `skipped_k_`, and `silhouette_sample_size_` expose selection evidence. This package does not persist or register fitted artifacts.

## Local evaluation

Final branch ML regression suite: **40 tests passed** with no skipped tests. The focused core tests recover five deliberately separated numeric groups exactly (adjusted Rand index 1.0) and verify repeatable scores/predictions with a 30-row silhouette sample. Invalid, Boolean, complex, nonfinite, degenerate and prediction-width inputs are checked. One existing Starlette/httpx deprecation warning remains; dependencies were not changed.

A separate fixed-seed smoke used 5,000 **artificial numeric feature rows**, five deliberately separated groups and five dimensions; this is not the product synthetic-household population or a held-out generalization evaluation. The core selected k=5, recovered the toy partition with ARI1.0 and scored a fixed1,000-row sample. Silhouettes for k4..8 were0.78627/0.99063/0.83235/0.65488/0.48078. These numbers demonstrate bounded algorithm behavior on easy toy groups and do not establish useful spend personas. Source: Conductor local run2026-10-05, seed42, n_init10, single-thread numerical libraries. Artifacts: final ML pytest log and ST125a-5000-feature-smoke.json outside the checkout.

## Limitations and remaining work

This does not build the product's category spend-share, count, average-price, or cadence features and has not been evaluated on the required 5,000-household synthetic population. It has no reviewed bilingual labels, privacy-safe cohort statistics, descriptor clustering, training workflow, artifacts, registry, or application integration. Synthetic separated-group tests show code behavior only; they do not establish meaningful personas or product quality. The required feature builder and integration work remain pending.
