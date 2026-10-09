# ST125g architecture plan: offline persona model snapshot

**Status: prerequisite accepted; implementation authorized within this narrow plan.** PR 205 was accepted on main at 27bc0b9fa0cc6f88005f3651f9e73da7f854ef2a after all 35 actual steps in CI 37992969773 succeeded and source/main trees matched. The accepted-main receipt is retained alongside ST125f. This is a small, local Type 2b module change. It stays within the existing offline clustering component and introduces no package, dependency, API, registry, persistence service, or product surface. If implementation expands into any of those boundaries, stop and reclassify under `DECISION_RULES.md` before proceeding.

## Evidence and boundary

`PersonaClusterer` already fits `StandardScaler` plus native scikit-learn `KMeans`, retains their state for prediction, and binds canonical schema/name metadata when asked to fit `household-persona-v1`. Its `predict` applies the fitted scaler and estimator. `review_artifact.py` deliberately serializes original-scale inverse-transformed centroid descriptions, label counts, and selection evidence for review. It does not contain the scaler parameters or native scaled centroids, and cannot recreate the fitted predictor. The old 5,000-row smoke run is not a saved-model artifact; do not rerun a large fit to manufacture missing weights. Existing focused canonical fits are enough for snapshot parity tests.

Spec §3 describes K-Means on household persona features and later human-reviewed names, but the current core model card explicitly says the statistical core is partial and not persisted, registered, evaluated on the product population, or integrated. Constitution privacy and honesty rules require keeping identity and transaction data outside this payload and not presenting synthetic toy behavior as useful personas. This task does not authorize semantic labels, a registry, endpoints, database rows, monetary values, or a production/readiness claim. The user's existing UI remains untouched.

## Smallest coherent change after the gate

Add one private module, `services/ml/app/clustering/model_snapshot.py`, for an immutable, fixed-schema snapshot and deterministic strict JSON encode/decode. A snapshot is a bounded collection of primitive tuples/scalars containing:

- explicit snapshot format version, canonical `household-persona-v1` schema and the exact 25 canonical feature names in order;
- selected `k` in 4–8; the exact native K-Means scaled `cluster_centers_`; and the fitted scaler's 25-element `mean_` and `scale_`;
- bounded fit metadata needed to describe the fit (training row count 9–5,000, `random_state`, and `n_init`).

The builder accepts only the exact fitted `PersonaClusterer`, native `KMeans`, and native `StandardScaler` types with internally consistent canonical metadata and array shapes. It copies values to immutable tuples and checks finite values, dimensions, bounds, and fit-setting consistency before returning. The serializer accepts only the exact snapshot type, revalidates every field, emits canonical sorted compact JSON with `allow_nan=False`, and exposes only fixed keys. The decoder accepts only bounded strict JSON text matching that exact key set and primitive types; reject duplicate keys, unknown fields, bool-as-int, non-finite constants, wrong feature order, wrong lengths, invalid ranges, and malformed nested data with one fixed safe error that never echoes caller text. Do not use pickle, joblib, arbitrary object loading, or embedded caller names/IDs/rows.

A pure inference function accepts exactly one canonical 25-number feature vector (or a fixed batch only if existing conventions make that materially simpler), validates finite real values and canonical per-feature bounds, standardizes with stored mean/scale, and returns only anonymous integer cluster indices. It computes nearest squared Euclidean distance to stored scaled centers, with first/smallest index winning exact ties, matching native K-Means prediction. No labels or descriptions are attached. Bound the numeric input and center magnitudes so distance arithmetic cannot overflow; reject Boolean values. Inference must not mutate the snapshot or retain input data.

This JSON is a private offline weight container, not an authenticated artifact or proof of training provenance. Any caller able to construct a structurally valid payload can create one; it must not be accepted as authorization, registration, production publication, or a trusted trained model. Keep all reads/writes local to explicit callers; this task does not add file I/O.

## Paths and tests

Maximum proposed changed paths: three.

1. `services/ml/app/clustering/model_snapshot.py` — immutable model weights, strict JSON boundary, and anonymous pure inference.
2. `services/ml/tests/test_persona_model_snapshot.py` — focused tests using the existing small canonical native fit fixture.
3. `services/ml/model_cards/persona-clustering-core.md` — update persistence status and clarify that a private snapshot format adds no evaluation, labels, registry, or integration.

Do not edit `core.py`, `centroid_descriptions.py`, `review_artifact.py`, UI files, feature construction, API/contracts, or dependency manifests for this follow-up. The feature schema and canonical names already live in `core.py`; do not fork them into a second source of truth.

Meaningful tests after acceptance:

- Build from the exact fitted canonical native types; assert immutable deep copies retain centers, mean, scale and metadata after mutating the original estimator/scaler; assert builder/serializer do not call fit or predict.
- Encode/decode deterministically and compare inference IDs on valid canonical test vectors directly with the original native `PersonaClusterer.predict`; cover tie behavior explicitly.
- Exercise bad native classes, incomplete/inconsistent estimator and scaler metadata, wrong feature schema/order/width, wrong `k`, invalid settings/sample counts, and malformed snapshots.
- Exercise JSON duplicate/unknown/missing keys, malformed JSON, arrays of wrong shape, bools, strings, NaN/infinity, out-of-bound and overflow-prone numbers; assert one fixed error and that attacker-supplied marker text is absent.
- Verify only integer anonymous cluster IDs are returned, with no names/descriptions, and inference leaves snapshot/input unchanged.

Run only the focused snapshot tests plus the existing clustering and review-artifact tests after implementation. No 5,000-row fit is needed. If a concrete bounded canonical fit cannot validate serialization and parity, document why before considering any larger fit; do not claim population quality from it.

## Acceptance and reporting gates

1. Wait for actual PR 205 acceptance evidence; do not infer it from the dispatch or this plan.
2. Implement only the three listed paths and focused offline tests after the gate.
3. Report this as private native statistical-weight persistence and canonical anonymous inference only. Keep model-card limitations explicit: no saved old run, product population evaluation, semantic names, registry, API, DB persistence, or production integration.
4. If a reviewer requires public exposure, cross-module API/schema, a new dependency, registered model lifecycle, or semantic naming, stop and reclassify. Cross-cutting architecture is at least Type 2a; any security model, product scope, production/public exposure, or uncertainty that may be Type 1 must go to the Conductor under the decision rules.
