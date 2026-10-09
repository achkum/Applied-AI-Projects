# ST-125h independent source review

**Decision: APPROVE**

The three reviewed files match the recorded source freeze exactly:

- `services/ml/app/clustering/training.py` — SHA-256 `25bf4545b380e86f8949249951eb0bc42996f74c0b14fc08e183c5c5261d7bf1`
- `services/ml/tests/test_persona_training.py` — SHA-256 `0727c9207c664209ea3504cf831e673b08696c387c73a33d7f82a929b57ebbd3`
- `services/ml/model_cards/persona-clustering-core.md` — SHA-256 `9cc2121edbe869590ec04bced7a20549dbc93f78c588224019844574bb41f086`

## Findings

No blocking source findings. The entry point enforces exact built-in tuple/row/value types, 9–5,000 rows, 25 columns, finite values, and feature-specific bounds before calling the clusterer. Invalid inputs receive the specified generic input error. It creates the clusterer with seed 42, `n_init=10`, and silhouette limit 1,000, calls `PersonaClusterer.fit` once with the canonical schema, then builds both exports from that same fitted instance. The export agreement guard checks schema, feature names, selected k, sample count, seed, and initialization count. Fit and export failures are normalized to the generic unavailable error.

The returned frozen, slotted result contains only the immutable review artifact and primitive model snapshot. It exposes no fitted model or training rows. The implementation introduces no I/O, persistence, registry, provider, API, UI, dependency, or database path. Existing core candidate fitting remains inside `PersonaClusterer.fit` and is accurately described as multiple candidate fits in the model card. Tests exercise a genuine 16-row native fit, fit-call count and settings, export consistency and immutability, malformed inputs rejected before fit, and generic handling for degenerate and unsupported-scale native fits.

## Limits

This source review did not run tests or builds. Input structure and numeric ranges cannot establish feature provenance, semantic correctness, authorization, or household scope; the caller remains responsible for those. The callable and its toy-size test do not establish useful personas on product data, population quality, or production readiness. Candidate k-means fits still occur internally for feasible k values 4 through 8.
