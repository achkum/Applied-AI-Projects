# ST250 infrastructure source handoff

2026-10-14, child worktree, current committed base `96e7ff0dd85832d95b26f4964be187c5fb31276f` plus these seven owned uncommitted infrastructure files. Devops source author; independent final source review required. No Git, remote mutation, Docker build, image pull, credential creation, migration or exposure occurred.

Implemented finite reviewed packaging: non-default prepared profile; no published ports; disabled startup/publication; isolated database/ingress networks; bootstrap secret absent from API; nonroot workers; actual Compose memory/PID/CPU caps, rotated logs, persistent data/certificate volumes and read-only secret mounts. Caddy candidate explicitly selects Let's Encrypt shortlived at the verified IPv4, internal8080/8443, admin disabled and503-only; no API proxy/download claim. Images require externally verified digest inputs, never invented pins. Dockerfile builds actual lifecycle/bank/detection/Synthetic sources and requires a real approved sandbox/main entrypoint; no Nest/proof fallback. Deployment script only validates/preflights and rejects execution. Future preflight checks exact host/root, symlink ancestry, available memory, secret ownership/mode and already-present digest images; no destructive command exists.

Actual lightweight checks:
- Git Bash `bash -n` for both scripts PASS.
- Local pinned YAML2.9.1 parser PASS; asserted exact project/three services/nondefault profiles, no host ports/privileged/network_mode/hostPID/devices, dropped capabilities/no-new-privileges, no automatic restart, actual256/384/96MiB limits, gateway excluded from database network, API startup/publication false, bootstrap secret excluded from API, bounded logging and tmpfs string shapes.
- Actual `deploy.sh execute` rejects with exit2 before Docker/remote activity PASS.
- Actual `verify.sh validate` with absent digest inputs rejects with exit1 before Docker activity PASS.
- Scoped whitespace diff PASS. These new files remain untracked until root curates them; no completion inferred from Git diff alone.

Not executed: Docker Compose config, pinned Caddy adaptation/binary validation, image resolution/build, live secret mount access, volume ownership, public TLS/ACME, persistent backend or phone installation. Local Docker CLI is unavailable; do not turn missing executable into fake success. Entrypoint/migration/identity remain absent/pending; image build intentionally unavailable. Verify runtime dependency packaging once the sandbox entrypoint/import graph exists (especially Prisma if used); currently no legacy Nest substitution is permitted.

## Exact SHA256 source roster

infra/sandbox/compose.yaml a65589431356a96b67f3230f862ac4c82771e97fff1dbdcbadb5929349234919
infra/sandbox/Caddyfile 33474d05490e9e53d3ec40e83102a2f426a85c648557e049e481cc735f5175b7
infra/sandbox/sandbox.env.example 60fa2ae5dc11f71a468ea1b804164cf4385a9490224572517f92d20326ac267b
infra/sandbox/Dockerfile.api 3a07fe740085a458946d53475aa93b70c40c560ba716f962556ac475ea272871
tools/sandbox/deploy.sh b9c657e5e43fe07cfdb91918c3cec8606650e00e6e93134eaf8b3b93476ec28b
tools/sandbox/verify.sh 86fb14b8fb7e6801c94942ac9c8965c173a419b81474b1a80e9fd30e05f3b603
docs/ops/SANDBOX.md 7aad977e87b0edee0bc146c836faed89d85cb50985d103a3f0685ee0f3eeeb62

Next handoff is independent infrastructure source review, then source/image validation on an appropriate bounded tool host without starting services. Actual public exposure remains gated by identity adoption, reviewed persistent runtime/migrations, deployment security sign-off and trusted TLS. Root owns allowed-path amendments, Git and release coordination.
