# Descriptor clustering core (offline primitive)

**Status:** private, offline algorithm core; not an integrated merchant matcher.
**Implementation version:** 0.1.0 (package version).

## Method and input boundary

`cluster_descriptors` accepts a non-empty list or tuple of non-empty strings, at most 2,000 rows and 256 characters per row. The caller must establish authorization, privacy, and scoping before invocation. This module is not an authenticator, does not log descriptor text, and returns only input-ordered labels plus sample, cluster, and noise counts. Labels use `-1` for noise and canonicalize cluster IDs by first occurrence; repeatability applies to the same ordered input and does not imply permutation invariance or semantic identities.

The core builds a dense float64, L2-normalized TF-IDF matrix from `char_wb` n-grams of sizes 3 through 5, capped at 1,024 features, then applies Euclidean HDBSCAN with `min_cluster_size=3` and `min_samples=2` by default. Parameter bounds are 2..n and 1..n respectively. Empty vocabularies and identical transformed rows are rejected. No model, training artifact, registry entry, provider, or network request is created.

## Evaluation

The focused tests use synthetic descriptor strings only and check separated groups with noise, repeated-row handling, repeat calls on identical ordered input, label/count behavior, bounds, malformed input, empty vocabulary, degenerate rows, and result privacy/frozenness. These fixtures demonstrate implementation behavior only; no real merchant data, held-out evaluation, alias acceptance, or product-quality claim is included. Test execution is owned by root QA and has not been run by this author.

## Limitations and remaining work

This task adds a local algorithm primitive only. Callers remain responsible for privacy and scope. Human review, cohort statistics, training registry, merchant alias review, and product integration remain separate work.

Root QA (2026-10-08): all 60 ML tests passed, including 20 descriptor tests. The synthetic seven-row fixture produced two clusters and one noise point; this is fixture behavior, not merchant-quality validation. Two invalid two-row fixture parameter defaults were corrected to min_cluster_size=2 before the passing full run. Existing Starlette deprecation and sklearn copy-default warnings were observed; no test was skipped or warning suppressed.
