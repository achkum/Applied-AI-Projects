# ST-125f independent architect-data source review, follow-up

**Decision: APPROVE_SOURCE.** The previously identified model/scaler stand-in issue is fixed: the builder now requires exact native `sklearn.cluster.KMeans` and `sklearn.preprocessing.StandardScaler` instances before validating fitted metadata. Two parameterized regression cases substitute model-like stand-ins for each field and require the generic safe error. This closes the source-review finding without asserting cryptographic model or data provenance.

The reviewed implementation and evidence continue to meet the approved private offline artifact contract. The builder derives per-cluster counts from the actual fitted label array, checks fitted sample/feature metadata and bounded configuration, validates candidate/skipped accounting and the exact smaller-`k` tie rule, and copies centroid values into immutable primitive tuples. Serialization revalidates fixed schema/names, nested immutable shapes, bounds, counts, and selection evidence; it emits deterministic strict JSON and reports malformed or incomplete state through generic input-free `ValueError`. The payload carries aggregate centroid coordinates, counts and selection evidence only. It contains no rows, IDs, individual assignments, arbitrary text, or estimator references. The marker is explicitly documented as a trusted caller declaration, not proof of origin, authorization, or semantic column validity.

The existing single authorized fit receipt remains unchanged: one new fit on the verified 5,000 × 25 synthetic input, seed 42, `n_init=10`, silhouette sample 1,000, one numerical thread; selected `k=8`, silhouette 0.13414094511155428, with aggregate counts summing to 5,000. The weak separation and lack of representativeness, target quality, ground truth, frozen names, useful cohorts, monetary claims, or integration are stated. Updated QA/model card report 109 tests passed (31 artifact, 78 prior), four existing dependency warnings, with none skipped. No fit or tests were run as part of this source review.

Independent SHA-256 recomputation matches all four entries in the renewed `.sdlc/evidence/ST-125f/source-freeze.json`:

| Frozen path | SHA-256 |
|---|---|
| `services/ml/app/clustering/review_artifact.py` | `7e22033d85f63caf2de8b3c079ff02d0d7f6e73cd1979753da20f69127963b65` |
| `services/ml/app/clustering/__init__.py` | `0dcaf57971c9d7ae99a1bbcd9a7b142d5f02655aef4e9ff6fead2ee44f3a1d0b` |
| `services/ml/tests/test_persona_review_artifact.py` | `c9acd9e646c40ae0985dfac50f50a57d776e77ca22533cf9fb39c22199d24af4` |
| `services/ml/model_cards/persona-review-artifact.md` | `8cc6f104d1136ce1b90d42a16c03c5f479cdb3f87b08c29a80d1e25948d87220` |

This approval applies to these frozen source files. Any source change invalidates it and requires a new freeze and independent review.
