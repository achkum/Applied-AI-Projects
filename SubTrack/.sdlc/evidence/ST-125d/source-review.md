# ST-125d Frozen Source Review

**Decision: APPROVE_SOURCE**

Reviewed the frozen ST-125d implementation against the task contract, `AGENTS.md`, the Constitution, AI/ML spec §3, the approved architecture plan, and root QA evidence. This approval covers only the frozen source artifacts listed below. It is not a completion or production-readiness approval for ST-125d.

The core implements a bounded, private offline function for caller-scoped synthetic descriptors. It accepts only a nonempty list or tuple, caps rows at 2,000 and strings at 256 characters, rejects invalid parameter types (including booleans) and out-of-range values, and returns a frozen slotted result with tuple labels and aggregate counts only. Error messages do not include descriptor text. The function does not retain descriptors or create a model artifact. Caller authorization, privacy, and scoping remain explicitly outside this primitive.

Feature construction matches the approved design: dense float64, L2-normalized `char_wb` TF-IDF with 3–5 character n-grams and at most 1,024 features, followed by Euclidean sklearn HDBSCAN. Empty vocabulary is translated to a stable input error; identical transformed rows are rejected while duplicates in mixed input remain permitted. Noise remains `-1`; non-noise IDs are canonicalized by first occurrence. The implementation makes no permutation-invariance or semantic-label claim.

The tests use independent synthetic merchant-like groups, a separate noise item, duplicate rows, repeat calls, exact fixture counts, and malformed/boundary/parameter/empty-vocabulary/degenerate cases. They check frozen/slotted output and absence of descriptor text from results. They assert fixture behavior rather than accepted aliases or general clustering quality. The model card accurately describes the synthetic-only scope, bounds and parameters, caller privacy responsibility, observed fixture behavior, and pending human review/integration work. Root QA records 60 ML tests passing (20 new, 40 existing); I did not run tests as part of this source review.

No dependency, route, provider, database, money, authentication, or public API change is present in the reviewed source scope. Remaining reviewed-label, cohort-statistics, training-registry, merchant-alias-review, and product-integration tasks remain open; this does not claim full ST-125 completion.

## Frozen source hashes

| Path | SHA-256 |
|---|---|
| `services/ml/app/clustering/descriptors.py` | `9e7a79129f201acd75e934023633844740205813859771f8b684167f9a1426af` |
| `services/ml/app/clustering/__init__.py` | `8694a1dc8f93814ae6b562d0c0b2eb513639e87acb8bd11ea823e915ece67447` |
| `services/ml/tests/test_descriptor_clustering.py` | `e255c5c9ce04d0fed4ebb72d5aeb26fc346ea794063478bec63806b1d036544a` |
| `services/ml/model_cards/descriptor-clustering-core.md` | `1a6497468f2f764bafedab7515ad159faa734d427adfcbd4359216e7b8fdc25e` |

Each hash was recomputed independently and matches `.sdlc/evidence/ST-125d/source-freeze.json`. Any source change invalidates this review.
