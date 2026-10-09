# ST-125f independent architect-data source review

**Decision: BLOCKED.** The exported schema marker is correctly described as trusted caller attestation and the serializer enforces a fixed primitive-only payload. However, the builder accepts any objects placed in `PersonaClusterer.model_` and `.scaler_` if they expose matching attributes. It does not verify that these are actual fitted `sklearn.cluster.KMeans` and `sklearn.preprocessing.StandardScaler` instances. A caller can therefore substitute model-like objects with fabricated metadata, labels, and inverse-transformed centroids and receive an artifact that the builder presents as extracted from an actual fitted clusterer. This fails the plan's requirement for an actual fitted KMeans and consistent scaler state. Add exact or appropriate `isinstance` checks for the expected estimator classes and fitted-state metadata, with a regression test substituting stand-ins; then freeze and request a fresh source review. The review does not claim estimator internals or dataset origin can be cryptographically authenticated.

The reviewed implementation otherwise follows the principal contract: fitted labels determine positive per-cluster counts; sklearn's integral-valued `np.float64` scaler sample count is accepted while fractional, boolean, and array counts are rejected; configured silhouette sample cap bounds and sample count consistency are checked; scored and skipped candidates partition 4–8 and exact ties choose the smaller `k`; tuples and primitive copies keep references out; serialization revalidates immutable nested shapes and fixed names/bounds, rejects malformed/incomplete objects with a generic input-free `ValueError`, and emits strict deterministic JSON. The artifact contains only aggregate counts, candidate scores, and centroid coordinates, without rows, assignments, arbitrary text, IDs, or model references. The schema marker remains only a caller declaration, as the plan and model card state.

The aggregate receipt reports one new fit on the byte-verified 5,000 × 25 synthetic input, seed 42, `n_init=10`, silhouette sample size 1,000, one numerical thread, selected `k=8`, and silhouette 0.13414094511155428. Counts and centroid output are aggregate only; the weak separation and the absence of representativeness, semantic, cohort, or integration claims are properly stated. The model card reports 107 tests passed (29 new, 78 existing) with four existing dependency warnings; this review performed no tests or fits.

Independent SHA-256 recomputation matches all four entries in `.sdlc/evidence/ST-125f/source-freeze.json`:

| Frozen path | SHA-256 |
|---|---|
| `services/ml/app/clustering/review_artifact.py` | `039ae774fe159c330115aed6671624351e9087908efb6b278270def8e803d321` |
| `services/ml/app/clustering/__init__.py` | `0dcaf57971c9d7ae99a1bbcd9a7b142d5f02655aef4e9ff6fead2ee44f3a1d0b` |
| `services/ml/tests/test_persona_review_artifact.py` | `b3fa7d7f5f7f46cb69a82a877c8c3f707e60744ac0a38d5e19a419df62f29398` |
| `services/ml/model_cards/persona-review-artifact.md` | `328fbe012c77ba19de4cb79a1edbc231c6b11e96dcde510cdca22f08b1aea0cc` |

Any source change requires a new freeze and independent review.
