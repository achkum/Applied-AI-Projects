# ST-202 CI cache source review

**Review result: conditional approval of the frozen source only.** The source matches the intended CI-only registry adjustment and preserves the default Compose configuration. Merge remains blocked until the hosted documentation, all five manifest inspections, and the existing runtime proof complete successfully.

## Frozen source inventory

Recomputed SHA-256 values from the current working tree match all three entries in `SubTrack/.sdlc/evidence/ST-202/source-freeze.json`:

| Exact path | Working-tree SHA-256 | Freeze match |
| --- | --- | --- |
| `.github/workflows/subtrack-ci.yml` | `68dcbb5760e672634b8a65dbcb80df083c0c63c3d39bc4e4ed60d480aa975026` | Yes |
| `SubTrack/docker-compose.ci.yml` | `935b54d634213082064188dd1ded597dedb2d4721560318b9eb1248d83972099` | Yes |
| `SubTrack/services/ml/Dockerfile` | `46e115249631f1d9c2b463dfc40f91aed05e0fd2a7d87cdd311e8c783123e7e5` | Yes |

This is the complete source inventory: three paths. These are working-tree values, not baseline or namespace counts.

## Findings

- The workflow applies `COMPOSE_FILE=docker-compose.yml:docker-compose.ci.yml` only to `compose-runtime-proof`. The CI overlay changes the four Docker Official Image references to `mirror.gcr.io/library/...` and pins Mailpit to the previously verified GHCR digest.
- The workflow adds a fail-closed hosted preflight before `make up`: it fetches Google's Artifact Registry Docker Hub cache documentation and inspects each of the five exact image references, requiring registry digest output and logging reported digests. Any documentation, manifest, or digest failure stops before startup.
- Existing runtime checks remain in place: all five services must report healthy, followed logs must produce output, named volumes must remain after `make down`, and cleanup runs with `always()`.
- The ML Dockerfile now has `ARG PYTHON_BASE_IMAGE=python:3.12-slim` before `FROM ${PYTHON_BASE_IMAGE}`. The ordinary default remains the original Python image; only the CI overlay supplies the mirror argument.
- The original `SubTrack/docker-compose.yml` at baseline `3c195ef56969ac2b5140fc002d42b8d4ae6b26a0` is unchanged in the working tree. The `quality-gates` job has no changes in the source diff.
- No evidence here establishes current availability of the Google cache tags. Local registry access was denied, as recorded in `mirror-correction.md`; the Google documentation and five live manifest checks must pass on the hosted runner. No hosted startup, health, log, volume-retention, or cleanup result was observed in this review.

## Review boundary

Read-only review of the task contract, repository instructions and Constitution, source evidence, exact three working-tree files, and baseline Compose/Dockerfile. No source changes, Git mutations, daemon use, tests, network access, dependency installation, or hosted CI validation were performed.
