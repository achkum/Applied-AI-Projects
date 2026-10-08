# ST125e architect-data plan review

**Decision: BLOCK PLAN pending one narrow contract correction.** This is a useful Type 2b offline statistical slice under AI_ML_SPEC §3. It can produce private review material from an already fitted `PersonaClusterer`, with no refit, new dependency, network/LLM call, money arithmetic, registry, product integration, or label approval. The parent ST125 remains partial.

## Blocking concern: feature order is not recorded by the fitted model

The verified ST-125b schema is exactly 25 dimensions: the 22 values of `CLUSTERING_CATEGORY_CODES` in their frozen order, then `subscriptionCount`, `averageMonthlyPriceRelativeTo1000Sek`, and `annualShare`. The average field is an unclamped ratio to 1,000 SEK/month; it is not SEK. `annualShare` is cadence row-count share. The Python `PersonaClusterer.fit` stores only `n_features_in_`, scaler, and estimator; it accepts arbitrary column order and cannot currently prove a 25-column matrix used this domain order. Checking only that the model has 25 columns would allow plausible but false descriptions.

Before implementation, bind immutable feature-name metadata to the fitted model (or an equally strict fit-time schema object) and require an exact equality check against the canonical 25-name sequence before describing centroids. Do not accept caller-supplied arbitrary names as proof of the fitted matrix order. Keep generic core fitting/prediction compatible for existing callers; centroid-description output must fail with a stable input-free `ValueError` if schema metadata is absent, wrong, or reordered. Grant only the additional core/test path needed for this metadata and the new description primitive in the task contract.

## Recommended minimal output contract

Add a pure function in the existing ML clustering package that accepts only a fitted clusterer carrying the validated canonical schema. It should check estimator/scaler/feature metadata are present and dimensionally consistent, obtain the selected estimator's centers in scaled space, and call the fitted scaler's `inverse_transform` to recover centroid coordinates in original dimensionless feature space. It must not call `fit`, `fit_transform`, or `predict`.

Return a deterministic immutable tuple of frozen/slotted records, ordered by numeric cluster ID, containing only the cluster ID and an immutable tuple of `(fixed_feature_name, finite_float_value)` pairs in canonical order. Copy scalar values out; expose no NumPy arrays, estimator, scaler, input matrix, household rows, or mutable model references. Reject non-finite centers/results and shape mismatches with stable messages that include no input data. Preserve the original 25 feature names and values; do not turn ratios/counts into currency, round them into money, or invent category descriptions. This is statistical review data only, not a persona name, cohort claim, or human approval.

## Privacy and bounds

Accept no caller text, IDs, transactions, descriptors, monetary fields, or real household input. The operation uses only the already-fitted model's 25-dimensional sufficient statistics. No logging, file writes, serialization, network, LLM, database, API, UI, authentication, alias, artifact registry, or automatic label acceptance belongs here. Bound the input contract to exactly the fitted model's fixed 25 features and its existing selected cluster count; do not add a separate arbitrary-matrix or arbitrary-feature-name entry point. Error messages must not interpolate matrices or feature values.

## Focused evidence required in the later implementation task

Use small synthetic data only. Test exact canonical schema acceptance and missing/reordered/extra schema rejection; unfitted and inconsistent-state errors; exact output shape/order and immutable isolation from returned containers/model internals; stable repeated descriptions; finite output; and proof that coordinates are inverse-scaled original dimensionless features. The inverse-scaling test should use a small directly computed `StandardScaler` expected value (or known synthetic centroids) independent of the production helper, so it cannot pass by comparing the function to itself. Also prove no refit/predict occurs, for example with estimator/scaler spies or call-counting test doubles. No 5,000-row fit, external evaluation, metric claim, label review, or full ST125 completion claim is needed for this slice.

Allowed implementation paths should be limited to the core metadata addition, new centroid-description module/export if required, focused clustering tests, the relevant model-card note, and the ST125e task/evidence files. Do not edit domain feature construction, synthetic generation, APIs, app code, dependencies, or unrelated task metadata.

## Follow-up disposition: corrected plan approved

The proposal now specifies an explicit optional closed fit-time marker, `feature_schema: Literal["household-persona-v1"] | None = None`, while retaining generic `fit(features)` behavior. This resolves the blocker as a Type 2b plan, with an important boundary: the marker records the caller's upstream schema attestation; it does not inspect values to prove semantic column order, authenticate scope, or establish privacy. The trusted fit caller must pass features built in the canonical ST-125b order.

**Decision: APPROVE_PLAN, conditional on implementing this exact contract.** The successful fit carrying the marker must require exactly 25 columns and store the marker plus an immutable tuple of the canonical feature names. Unknown marker values and wrong dimensions fail with input-free errors. Generic fits store no named schema. A successful generic refit clears prior metadata, and all fitted state (scaler, estimator, dimensions, and schema metadata) changes atomically only after a successful fit; any failed fit preserves the previous fitted snapshot.

The stable description API is `describe_persona_centroids(clusterer: PersonaClusterer) -> tuple[CentroidDescription, ...]`. It requires the exact marker, exact stored canonical tuple, and consistent scaler/estimator dimensions. Each frozen, slotted `CentroidDescription` contains `cluster_id: int` and `features: tuple[tuple[str, float], ...]`, ordered by numeric cluster ID and then canonical feature order. It inverse-transforms selected centers using the existing fitted scaler; it never fits, predicts, mutates the model, or returns model/array references. Keep values in original dimensionless units. The fixed feature schema bounds are category shares and annual share [0, 1], count [0, 10,000], and average-relative value [0, 10,000,000], consistent with the accepted builder caps. Reject non-finite or out-of-bounds results with stable input-free errors.

For the implementation task, the narrowly allowed source/test/documentation paths are:

- `services/ml/app/clustering/core.py`
- `services/ml/app/clustering/centroid_descriptions.py`
- `services/ml/app/clustering/__init__.py`
- `services/ml/tests/test_clustering.py` only if fit metadata coverage requires it
- `services/ml/tests/test_centroid_descriptions.py`
- `services/ml/model_cards/persona-clustering-features.md` (or the existing persona core card if the task owner chooses one)
- the ST125e task and its evidence paths, assigned by the task owner

Focused evidence must cover generic-fit compatibility, canonical fit acceptance, wrong marker and dimension, metadata absent/reordered/extra, successful generic refit clearing the marker, failed refit preserving all old state, inverse-scaled expected coordinates computed independently, finite/bounds checks, stable deterministic tuple ordering, mutation isolation, and no hidden refit or predict. Keep fixtures small and synthetic. Do not run a 5,000-row fit or claim reviewed names, cohort validity, LLM completion, or full ST125 completion. No dependency, API, UI, DB, auth, registry, money, or product wiring change is authorized.
