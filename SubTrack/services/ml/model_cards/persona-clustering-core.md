# Persona clustering core (partial)

**Status:** offline statistical core only; not an integrated persona or cohort feature.
**Implementation version:** 0.1.0 (package version); **seed:** 42 by default; **K-Means `n_init`:** 10 by default.

The private `train_persona_model` entry point accepts only 9–5,000 rows of 25 built-in numeric values in the canonical feature order and bounds. It performs one native `PersonaClusterer.fit` call with the canonical schema, seed 42, `n_init=10`, and a silhouette sample limit of 1,000, then exports the same fit as an immutable review artifact and model snapshot. Input shape and numeric bounds do not prove that the caller constructed semantically correct or properly scoped features; that remains the caller's responsibility. Training errors expose only a generic unavailable error. This callable does not register, persist, or expose a fitted model.

## Method and input boundary

`PersonaClusterer` accepts only a non-empty, finite, rectangular real numeric matrix. The upstream caller is responsible for authorization, scope, and constructing deterministic features. Input semantic scoping is the upstream caller’s responsibility; this component validates numeric shape/finite values and does not extract identifiers, transaction descriptors, account data or monetary features, or calculate spending. It standardizes the matrix with a fitted `StandardScaler`, fits scikit-learn K-Means for feasible `k` values from 4 through 8, and selects the largest silhouette score. Iteration is ascending and exact ties select the smaller `k`. K-Means uses a fixed random seed and explicit `n_init=10` by default. For more than 1,000 rows, silhouette scoring uses a deterministic sample selected with the same seed; candidate K-Means fits still use all supplied rows.

The fitted scaler and selected estimator are retained together and reused for prediction. `candidate_scores_`, `skipped_k_`, and `silhouette_sample_size_` expose selection evidence. A private `persona-model-snapshot-v1` format now supports bounded immutable weight snapshots, strict JSON round trips, and single-vector anonymous nearest-centroid inference. It contains scaled K-Means centers and scaler parameters only; it carries no household rows, identities, labels, or proof of fit provenance. It is not authenticated, registered, evaluated on the product population, or integrated into application inference. No historical fit was recovered or persisted.

## Local evaluation

Historical ST125a core regression suite: **40 tests passed** with no skipped tests. Snapshot-specific verification is recorded separately in ST125g evidence; this historical count is not the current suite total. The focused core tests recover five deliberately separated numeric groups exactly (adjusted Rand index 1.0) and verify repeatable scores/predictions with a 30-row silhouette sample. Invalid, Boolean, complex, nonfinite, degenerate and prediction-width inputs are checked. One existing Starlette/httpx deprecation warning remains; dependencies were not changed.

A separate fixed-seed smoke used 5,000 **artificial numeric feature rows**, five deliberately separated groups and five dimensions; this is not the product synthetic-household population or a held-out generalization evaluation. The core selected k=5, recovered the toy partition with ARI1.0 and scored a fixed1,000-row sample. Silhouettes for k4..8 were0.78627/0.99063/0.83235/0.65488/0.48078. These numbers demonstrate bounded algorithm behavior on easy toy groups and do not establish useful spend personas. Source: Conductor local run2026-10-05, seed42, n_init10, single-thread numerical libraries. Artifacts: final ML pytest log and ST125a-5000-feature-smoke.json outside the checkout.

## Limitations and remaining work

Sibling modules already provide deterministic canonical feature construction, original-scale centroid descriptions, descriptor clustering proposals, and aggregate review exports. ST125f evaluated a byte-verified 5,000-household synthetic population and reported a weak silhouette of 0.13414094511155428 with k=8; it did not save predictor weights or establish useful personas. This snapshot task uses only a small canonical native fit to verify weight copying and prediction parity, without repeating the population fit.

The private JSON format has a 65,536-character input limit. Supported scales are 1e-140 through 1e7 and scaled center magnitudes are at most 1e6; these conservative bounds deliberately exclude some possible native fits. Input vectors contain exactly 25 built-in integer or float values within canonical feature bounds. Serialization and inference perform no file I/O. Exact distance ties select the smallest cluster index; parity checks do not promise bitwise equality for every floating-point case near a boundary.

Human-reviewed bilingual labels, privacy-safe monetary cohort comparisons, training orchestration, registry lifecycle, durable artifact storage, and application integration remain pending. Snapshots are neither authenticated nor evidence of training provenance. Synthetic statistical checks do not establish product quality or production readiness.
