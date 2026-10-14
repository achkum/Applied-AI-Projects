# ST250 sandbox API image build plan

2026-10-14. Proposed exact executable paths, pending root freeze and independent PLAN review:

- `.github/workflows/subtrack-sandbox-api-build.yml`
- `SubTrack/tools/sandbox/build-api.sh`

Evidence handoff may be recorded under ST250. No backend/client source, Dockerfile, lockfile or deployment path expansion is proposed. A failed actual build produces a bounded finding and a narrow repair request; no fallback entrypoint or fake successful flag.

## Verified base and runner

Use a manually dispatched workflow, contents:read only, explicit ubuntu-24.04 standard runner, bounded30-minute job, no registry login/push/package upload, no deployment secrets or paid runner. Checkout an explicit curated head; capture and compare actual HEAD. Source actions must be immutable commit pins verified against existing approved action provenance. Build uses local Docker BuildKit with linux/amd64 and the existing actual `infra/sandbox/Dockerfile.api`, lockfile install and all existing build stages.

Read-only official Docker registry verification on2026-10-14 resolved `library/node:22.18.0-bookworm-slim`. Exact raw response bytes matched Docker-Content-Digest for index `sha256:752ea8a2f758c34002a0461bd9f1cee4f9a3c36d48494586f60ffce1fc708e0e`; its sole linux/amd64 child was separately fetched and hashed, matching `sha256:0d130e2ee18e88e1561375276daced6bff032539200173f2daf48c2e33f38ff5`. Proposed Dockerfile argument is `node:22.18.0-bookworm-slim@sha256:0d130e2ee18e88e1561375276daced6bff032539200173f2daf48c2e33f38ff5`, not an invented digest or mutable tag. Node22.18 supports the existing native TypeScript contract module import approach; actual resolution must still be tested in the produced image. Official image source: https://hub.docker.com/_/node . No secret is passed in a build argument or copied into the build context; Docker guidance: https://docs.docker.com/build/building/secrets/ .

## Actual image qualification

The launcher refuses unexpected source root/head/platform/base pin and uses a unique run-labelled local image/container namespace. It builds without source/runtime credentials or host secret mounts; capture build output in private bounded runner-temp files, suppress upload/raw output and report only fixed build/inspection/runtime/cleanup failure categories. No image tar or bulky artifact is uploaded in this first iteration.

Inspect actual image ID, configured1000:1000 user, dedicated node sandbox/main CMD, disabled startup/publication flags and expected production/sandbox environment. Run network:none, read-only filesystem, dropped capabilities, no-new-privileges, PID/memory/CPU/time bounds and no host ports/volumes. Probe actual Node version, pg resolution, contracts sandbox-mobile export/native TS parsing, compiled sandbox modules and both embedded SQL SHA256 values. Hash compiled main bytes. Default main invocation must exit nonzero with exactly the fixed `Sandbox startup unavailable` line and no open listener; expected failure is a fail-closed check, not successful startup. Do not claim DB behavior from a missing-secret failure.

Success requires actual build, all inspect/import/hash assertions and confirmed exact run-owned container/image cleanup. Cleanup uses captured IDs and verified run labels; never global prune or name-prefix deletion. The only optional artifact is a closed small JSON receipt containing sourceHead, base digest, image ID, Dockerfile hash, compiled main and both migration hashes, exact runtime version, preparation checks and cleanupConfirmed. No credential, connection string, owner/resource value or raw log is permitted. Upload only after known cleanup and strict schema checks; an unknown state yields no qualified receipt.

## Integration and handoff

This workflow proves image packaging and disabled startup, not running persistent business behavior or public ingress. Once the independently reviewed actual PG16 harness is ready, compose that harness with this same built image in a separately reviewed change: private Docker network, literal database alias,1000:1000-readable0600 secret mounts, unchanged DDL/key/manifest, actual main and measured two-owner/restart/refresh/logout scenarios. Do not duplicate business proofs or substitute mocked responses.

After image and integrated runtime qualification, propose a bounded authenticated transfer to the existing VPS as a separate reviewable action; no registry account, package publication, image export, VPS mutation or public activation occurs here. Current public/startup flags remain disabled in checked-in Compose and native runtime.
