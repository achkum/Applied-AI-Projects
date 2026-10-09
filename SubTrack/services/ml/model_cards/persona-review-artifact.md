# Persona review artifact

This private offline artifact records dimensionless centroid coordinates, the selected cluster count, actual fitted label counts, and silhouette selection evidence for a canonical `household-persona-v1` fit. It contains no household rows, identifiers, individual assignments, model references, or monetary values. Its schema marker is a trusted caller declaration; it does not prove source origin, column meaning, authorization, or real-household validity.

The builder accepts only a fitted `PersonaClusterer`, requires native KMeans and StandardScaler estimators, 9–5,000 training rows and 25 canonical features, and records the actual fitted label counts. Supported fit settings are `random_state` 0–2,147,483,647 and `n_init` 1–1,000; the configured silhouette sample cap is an integer from 9 to 5,000, and the actual sample size is the smaller of the row count and that cap. The selected `k` is the highest-scoring feasible value from 4–8, with exact ties resolved to the smaller value. Serialization validates the full immutable shape and emits deterministic strict JSON.

The authorized synthetic evaluation reported weak separation: selected silhouette 0.13414094511155428 at `k=8`. This result describes only that synthetic input and fit. It does not establish representativeness, target quality, ground truth, frozen persona names, useful cohorts, household spending claims, or production integration. Human review and any future integration remain separate.

## Conductor evaluation, 2026-10-09

Full ML suite: 109 tests passed (31 artifact cases and 78 prior cases), with four existing dependency warnings. The actual newly fitted, schema-marked model used the byte-verified existing 5,000 × 25 synthetic input, seed42, n_init10, silhouette sample1000 and one numerical thread. It selected k8 with silhouette0.13414094511155428; counts are 582,841,827,996,227,945,342,240. Sanitized centroid/count/selection JSON and the exact input/fit receipt are stored in ST125f evidence. This weak synthetic separation remains a limitation; the artifact is review material, not a saved estimator, approved persona labels, money/cohort data, or production integration.
