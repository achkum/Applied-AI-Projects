# Persona clustering synthetic population

**Status:** offline statistical input generator; implementation and offline evaluation verified; no product integration. This is a lightweight sampling recipe for exercising the existing feature builder. It is not a complete synthetic banking-history generator, a model, or an integrated product feature.

## Generation recipe

Each requested household gets an independent deterministic RNG derived from the supplied seed and its zero-based index. The recipe chooses one of five unnamed category-mixture templates uniformly. For each of 2–20 subscriptions, categories are sampled with 70% weight from the template's primary group, 20% from its secondary group, and 10% uniformly from all canonical categories. These weights describe only this sampling process; they are not personas and make no claims about actual households. Cadence is monthly or annual with a separate 20% annual draw. Prices are selected from a fixed illustrative list of positive SEK minor-unit amounts and passed unchanged as monthly-normalized values for either cadence.

The output contains only the existing 25 dimensionless feature names and vectors: 22 category spend shares, subscription count, average monthly price relative to 1,000 SEK, and annual share. Temporary category, cadence, and price rows are passed directly to the existing domain feature builder and are not returned or logged. The generator does not create names, identities, household records, locations, merchants, banks, account or transaction history, descriptors, or seed-derived identifiers.

## Limitations and evaluation

The template weights, category mix, cadence rate, and illustrative prices are authored assumptions, not measured cohort statistics or reviewed labels. The generated population cannot establish representativeness, ground-truth recovery, clustering quality, or real-household validity. The offline evaluation below measures this recipe only; no product integration is included. Any future evaluation must report its actual sample count, selected k, silhouette, and cluster counts as descriptive synthetic results only, and requires separately reviewed labels, cohort statistics, descriptor work, and runtime integration before product claims.

## Verified local evaluation

21 focused tests and all163synthetic-package tests in8files passed; typecheck and build passed. Lint passed with one existing unused-disable warning in unchanged rng.ts. The default generator produced5,000household subscription bundles and25feature dimensions. Each bundle was constructed from the documented recipe and processed by the accepted deterministic feature builder; this is distinct from the earlier arbitrary numeric-matrix smoke.

The accepted PersonaClusterer fit all5,000vectors with seed42, n_init10 and one numerical thread, evaluating a fixed1,000-row silhouette sample. It selected k8 with silhouette0.1341409451. Candidate k4..8 scores were0.1257054020/0.1131564399/0.1219010079/0.1222032281/0.1341409451. Cluster counts were582/841/827/996/227/945/342/240. The low silhouette indicates weak separation in this authored recipe; it does not establish useful personas or household representativeness. No ground-truth recovery metric is claimed. Dataset and evaluation hashes are recorded in task evidence. Reviewed frozen labels, cohort statistics, descriptor clustering, training/artifact registry and product integration remain pending.
