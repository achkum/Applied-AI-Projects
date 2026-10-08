# ST-125e architect-data source review

**Decision: APPROVE_SOURCE**

Reviewed the frozen implementation against `.sdlc/tasks/ST-125e.md`, the corrected plan in `.sdlc/evidence/ST-125e/architecture-plan.md`, `docs/governance/CONSTITUTION.md`, `docs/product/AI_ML_SPEC.md` §3, and the canonical schema in `packages/domain/clustering/features.ts`.

The fit marker remains optional and closed to `household-persona-v1`. Marked fits require 25 columns; generic callers retain the old `fit(features)` form. Model and scaler fitting happen in locals, and all fitted fields including schema metadata are assigned only after successful candidate selection. Thus successful generic refits clear schema metadata and exceptions during fit preserve the prior fitted snapshot. The stored feature names are an immutable tuple. As the task and model card state, the marker is only an upstream schema attestation: it cannot prove the actual semantic order of matrix values or establish caller scope/privacy.

The canonical Python tuple matches all 25 names from the domain feature builder in order: its 22 category codes followed by count, average-relative value, and annual share. The description function requires the exact marker and tuple plus consistent fitted dimensions. It checks a 4–8 centroid count, finite scaled and inverse-scaled values, and the fixed schema bounds, then returns a deterministic tuple of frozen/slotted records with copied Python floats and immutable feature tuples. It performs inverse scaling only and exposes no mutable model or array references. The fixed units remain dimensionless; the average-relative coordinate is not currency.

The focused test source covers generic compatibility and inability to describe generic fits, closed marker and width rejection, metadata clearing on generic refit, failed-refit snapshot preservation, absent/reordered/extra metadata, canonical parity with the domain source, finite/bounds and corrupted-state errors, stable ordered output, and immutable isolation. The expected inverse-scaled coordinates are computed independently as `centers * scaler.scale_ + scaler.mean_`; guards replace fit/predict operations with failures. These tests are source evidence; I did not run them.

The model card limits claims to offline statistical review coordinates and explicitly records the marker trust boundary, no author-run tests, and no 5,000-household fit, LLM naming, human approval, cohort validity, integration, or product-quality claim. Scope matches ST-125e; I found no dependency, provider, API, database, UI, money conversion, refit, or external-data addition.

## Frozen-source integrity

I recomputed SHA-256 for each frozen path against `.sdlc/evidence/ST-125e/source-freeze.json`. All five match:

| Frozen path | Recomputed SHA-256 | Result |
| --- | --- | --- |
| `services/ml/app/clustering/core.py` | `fa0127bb1c8e66f5089feb6ced48bdd8d9409880ab428192abd5ffafcdc9faad` | match |
| `services/ml/app/clustering/centroid_descriptions.py` | `39a7026b3c5f9203f4689a541d06e9c99167cde22cb719ffa82602e1d07d35ca` | match |
| `services/ml/app/clustering/__init__.py` | `23beb3203574d07bfd95f4f6d44c2979e47d67bf0d7e8a3da9af70478bd0e3bc` | match |
| `services/ml/tests/test_centroid_descriptions.py` | `a7b57e4c738f812da2ac3566c0b9174abe45e5e516e1777b49e56d603933eec1` | match |
| `services/ml/model_cards/persona-clustering-features.md` | `06900fb67eb433193a01f775f46400b0f70b7d4851330be4ce20a195b2ee7131` | match |

This approves only the frozen ST-125e source contract. It does not assert full ST-125 completion, LLM naming, human persona approval, cohort validity, or merchant quality. Any change to a frozen source file invalidates this approval and requires renewed review.
