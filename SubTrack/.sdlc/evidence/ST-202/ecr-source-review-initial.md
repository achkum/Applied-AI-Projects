# ST-202 independent source review

**Decision: conditional approve, with hosted registry proof required before merge.** Review is limited to source inspection and read-only Git object access. No daemon, tests, network, dependency installation, or Git mutation was used.

## Scope and behavior

The workflow sets `COMPOSE_FILE=docker-compose.yml:docker-compose.ci.yml` only in the `compose-runtime-proof` job. The quality-gates job has no such override. The default compose file remains byte-for-byte the same as `HEAD`, and the Dockerfile's `ARG PYTHON_BASE_IMAGE=python:3.12-slim` keeps ordinary local builds on the existing base image.

The CI overlay defines the same five service names (`postgres`, `redis`, `mailpit`, `caddy`, `ml`) and changes only the four image references plus the ML build argument. Inspection of the saved default and CI resolved configs shows the health checks, ports, environment, commands, networks, named volumes and project name remain equivalent. Workflow checks still require all five services healthy, exercise followed logs, verify both named volumes survive `make down`, and always clean up with `make down`. No skipped checks, deploy steps, or registry credentials were added.

The new hosted preflight fetches AWS's public-registry documentation and inspects each of the five exact image references, requiring manifest digest output. `set -euo pipefail`, nonempty document check, and the Node digest assertion make failures stop the job before `make up`. This is useful hosted evidence, but it has not run here. **Do not claim the ECR registry tags are available:** local ECR access returned HTTP 403 during preflight, so the four ECR image references remain unverified until this hosted step passes. The Mailpit GHCR index digest is locally verified as `sha256:e22dce5b36f93c77082e204a3942fb6b283b7896e057458400a4c88344c3df68`; the provided publisher build workflow independently publishes the matching GHCR namespace and version tags.

Candidate image references use TLS registry hosts. The GitHub-hosted proof must pass for all five images and retain digest evidence before merge; any failed or missing digest should block the merge rather than be treated as availability.

## Recomputed frozen baseline hashes

SHA-256 of the three original `HEAD` blobs, read with `git show`:

- `.github/workflows/subtrack-ci.yml`: `1100605167430c49318e9b76314a4806d8473aa81be4c8be5192216038fdddfb`
- `SubTrack/docker-compose.yml`: `2db0847788572e617da230148b600a0db2cee9bc8b821279ffa682775749262e`
- `SubTrack/services/ml/Dockerfile`: `f9420767fd71d7c221cb0267145388045ae2658c19f00ce68a176b2c4a5fd33e`

The default compose worktree hash still matches its frozen baseline. Current workflow and Dockerfile hashes are respectively `52c2a3f2c6992b021db49b8fee7fcd9e75f727061dc22183863605bff573d24f` and `46e115249631f1d9c2b463dfc40f91aed05e0fd2a7d87cdd311e8c783123e7e5`.

## Workflow namespace inventory

The workflow contains 7 `uses:` references and 6 distinct full action references, across **4 normalized action namespaces**: `actions`, `astral-sh`, `gitleaks`, and `pnpm` (within the requested cap of 6).

## Files reviewed

`SubTrack/AGENTS.md`, `docs/governance/CONSTITUTION.md`, `docs/governance/DECISION_RULES.md`, `.sdlc/tasks/ST-202.md`, `.sdlc/evidence/ST-202/registry-preflight.md`, `.github/workflows/subtrack-ci.yml`, `SubTrack/docker-compose.yml`, `SubTrack/docker-compose.ci.yml`, `SubTrack/services/ml/Dockerfile`, saved resolved compose configs, and `.setup/mailpit-publisher-build.yml`.
