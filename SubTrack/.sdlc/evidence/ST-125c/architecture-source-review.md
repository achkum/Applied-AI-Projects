# ST-125c independent source review

**Decision: APPROVE_SOURCE**

The implementation follows the approved plan. Configuration validation uses own property descriptors, accepts only the allowed keys, requires the seed, rejects present-but-undefined `households`, rejects accessors without reading them, and returns a frozen snapshot used for all later reads. Per-index RNG seeds use framed JSON tuple encoding, so each household is generated independently and population-size changes preserve the existing prefix.

The generator uses the approved canonical category groups and five template pairs, integer 70/20/10 group selection, 2–20 rows, fixed bigint price choices with no price arithmetic, and an independent 20% integer annual draw. It passes transient rows to the accepted `buildPersonaFeatures` function and returns only the existing feature names and 25-value vectors. Result, outer feature collection, and per-household vectors are frozen. Focused tests cover deterministic and prefix-stable generation, dimensions, bounds, variation, output keys, deep freezing, and strict malformed/accessor/proxy config cases.

Evidence is appropriately limited. The evaluation describes one generated 5,000×25 population, fixed model settings, selected k, silhouette, sample size, and cluster counts. The model card calls the separation weak and does not claim representativeness, ground-truth recovery, product quality, or completion of the broader synthetic banking-history work. QA reports the focused and package checks and retains the unrelated existing lint warning. The independent source hashes below match the source-freeze manifest exactly.

| Task-relative source path | SHA-256 |
| --- | --- |
| `packages/synthetic/src/clustering-population.ts` | `4bb9dcb45fa41605a9c752e8becf22b0fd0049d28b675d37727e282a47698d85` |
| `packages/synthetic/test/clustering-population.spec.ts` | `14a98c893b4f272ce10f7a9d2975595fc5f40f0ae32d91f24eeca550ff35878d` |
| `packages/synthetic/src/index.ts` | `81d80f393ad1d0cc2fd069bc33ab03ceda1a62b011b974086fbb8e3ab5c2ecfd` |
| `services/ml/model_cards/persona-clustering-population.md` | `25fcc0454d240675e6682a03a33c2b634f49c64a4ae1eaaccb20d8d0c17805bd` |

The QA/evaluation artifacts make no claim that ST-125c is complete or integrated. ST201 and ST198 approval gates remain outside this review and untouched.
