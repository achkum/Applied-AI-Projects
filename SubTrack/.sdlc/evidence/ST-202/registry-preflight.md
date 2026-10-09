# CI registry preflight

Checked 2026-10-09 for PR205CI37990098961. This was a read-only investigation; no Docker commands, credentials, application dependencies, source edits, or Git operations were used.

## Failure and required behavior

The two supplied CI logs show `make up` failing because Docker Hub reports the unauthenticated pull rate limit. The first attempt identifies `redis`; the retry identifies `mailpit`. Compose currently starts `postgres`, `redis`, `mailpit`, and `caddy`, and builds `ml` from `python:3.12-slim`. The workflow separately requires all five services healthy, exercises `make logs`, and verifies named-volume retention after `make down`. Any fix must preserve those checks and the ML build; it must not skip tests.

Current references: `postgres:16-alpine`, `redis:7-alpine`, `axllent/mailpit:v1.27`, `caddy:2-alpine`, `python:3.12-slim`.

## Registry evidence

- On 2026-10-09, a public pull-token request to GHCR followed by a `HEAD` of `ghcr.io/axllent/mailpit:v1.27` returned HTTP 200 and content type `application/vnd.oci.image.index.v1+json`. The observed index digest was `sha256:e22dce5b36f93c77082e204a3942fb6b283b7896e057458400a4c88344c3df68`. This verifies the GHCR tag resolves at that time; it does not independently verify publisher documentation or each platform child manifest.
- Public ECR token/gallery requests failed at the environment's CONNECT tunnel with HTTP 403. Therefore none of `public.ecr.aws/docker/library/{postgres:16-alpine,redis:7-alpine,caddy:2-alpine,python:3.12-slim}` is verified here, and no ECR digest is claimed. The denied network path is the remaining blocker to an all-five verified mirror recommendation.
- Docker Official Images metadata is publicly readable at `https://github.com/docker-library/official-images` (raw catalog files under `https://raw.githubusercontent.com/docker-library/official-images/master/library/`). Exact source tag catalog check results are recorded in the tool output for this note. Source catalog membership does not prove an ECR mirror tag exists or has the same digest.

## Feasible narrow design

Keep local defaults unchanged and let only the `compose-runtime-proof` job set image overrides. Candidate allowed paths are:

- `SubTrack/docker-compose.yml`: interpolate each service image with a default equal to the current reference; add a defaulted build argument for the ML base image.
- `SubTrack/services/ml/Dockerfile`: add an `ARG` defaulting to `python:3.12-slim` and use it in `FROM`.
- `.github/workflows/subtrack-ci.yml`: set the override variables only for `compose-runtime-proof`, using exact mirror references after registry tags and digests are verified.

The workflow must retain all existing five-service health checks, log assertion, volume-retention assertion, and cleanup. Do not remove or bypass the quality-gates job. No exact ECR references should be implemented until ECR access or another verified publisher mirror is available.

## Sources and scope

- Failure logs: `/workspace/.setup/ST125f-ci-failure.log`, `/workspace/.setup/ST125f-ci-retry-failure.log`.
- Compose, Dockerfile, Makefile, workflow, and governance instructions were read from their current workspace paths. The dispatch named `Constitution/DECISION_RULES`, which does not exist; the applicable files are `docs/governance/CONSTITUTION.md` and `docs/governance/DECISION_RULES.md`.
