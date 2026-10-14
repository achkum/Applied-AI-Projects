# ST-250 — Independent infrastructure source review

2026-10-14. Independent security/platform reviewer. Inspected the actual seven frozen source files, handoff, approved infrastructure plan and runtime package metadata. All seven SHA256 hashes below independently match the handoff. No tests, Docker/image/binary operations, Git mutation, credentials or remote execution performed.

**SOURCE GO for disabled infrastructure preparation only.** This is useful prepared source, not a deployable backend or public TLS acceptance. The implementation preserves the pending identity/public-runtime gates and introduces no active public endpoint. The conductor may curate this source; runtime execution/publication remains held until the separately reviewed authority, migrations, runnable image and deployment evidence exist.

## Accepted implementation

- All three Compose services require the non-default `sandbox-prepared` profile. No service publishes host ports, uses host networking/PID/devices, privileges or Docker socket. API startup/publication flags are literal false. Restart is disabled. API/database network is internal; gateway has only ingress, so no database connection path. Explicit local memory/CPU/PID caps, finite tmpfs and rotated logs match the plan. Persistent database/certificate/config volumes are preserved; documentation correctly states that volumes are not disk quotas.
- API/gateway run as UID1000 with read-only roots, all capabilities dropped and no-new-privileges. PostgreSQL uses the specified Debian UID999 and bounded connection/buffer settings; its data volume remains writable. Effective UID/volume compatibility is explicitly an unexecuted prerequisite, rather than assumed successful initialization.
- Dedicated sandbox secret file paths are read-only mounts. API receives only runtime and auth material, not the bootstrap password; gateway receives neither. Preflight checks canonical file path, no symlink, mode0600 and required effective UID, with directory0700. It inspects no secret contents. Effective mounted access and volume ownership remain later verification gates.
- `deploy.sh` accepts validation/preflight only and rejects other actions before Docker execution. Preflight requires the exact verified hostname, canonical new root, non-symlink ancestry and currently available memory. Neither script changes host configuration, invokes OpenClaw, starts services, runs SQL, creates credentials, removes volumes/data or prunes unrelated resources. `verify.sh` requires syntactically pinned image references, exact PostgreSQL16/Caddy2.11.7 tag namespace, Compose quiet validation and already-present image references; it does not pull images or claim their provenance/behavior.
- Dockerfile has no Nest or fixture fallback. It requires the approved sandbox entrypoint, builds lifecycle/bank/detection/Synthetic prerequisites and starts only compiled sandbox/main under a non-root user. Its missing entrypoint currently prevents the image build. The source/context must be a clean reviewed export; no build is authorized from a working checkout containing untracked credential/context files.
- Caddy has admin disabled, only canonical IPv4 site, explicit production Let's Encrypt ACME issuer plus `shortlived`, internal8080/8443 ports and finite request bounds/timeouts. There is no internal/self-signed issuer, arbitrary-host issuance, API proxy, download destination or success/health fabrication. The only response is unavailable503 and no access logging is enabled. No public port mapping exists. Actual pinned-binary configuration validity and ACME challenge/renewal/phone trust remain unexecuted.

## Concrete gates before a runnable image or deployment

These do not reject the intentionally disabled preparation; they must not disappear in the later implementation handoff:

1. **Runtime dependency gap is already observable:** API `pg` is presently a devDependency, while the final image installs production dependencies only. A PostgreSQL sandbox entrypoint importing `pg` would therefore lack a required declared production dependency. Freeze the relevant package/lockfile paths under the runtime task and correct that dependency before claiming a runnable image. Likewise verify Prisma's generated client and every contract/Money runtime import from the actual eventual graph; the build stage's generated Prisma output is not copied wholesale into the production dependency stage. Do not bypass this with fixture/devDependency installation at runtime.
2. Verify actual emitted sandbox entrypoint path and Node/workspace module resolution against the completed graph. A file-existence assertion alone does not prove the final image starts or resolves its imports.
3. Resolve registry digests with recorded official provenance, verify Node version and postgres UID, and run bounded Compose/Caddy binary validation on an appropriate tool host without starting services. Placeholder/64-hex syntax is not image authenticity or compatibility evidence.
4. Prepare and independently verify owned data/certificate/config volume UID/modes before startup; no broad chmod or privileged runtime workaround. Enforce actual data/admission capacity before public exposure in addition to these container budgets.
5. Identity adoption, real sandbox runtime/migrations, source/CI/security/deployment review, trusted TLS/renewal and actual durable two-owner/restart/logout/phone behavior remain release gates. The currently checked preparation profile must not become an alternative execution path around them.

The author reports Bash syntax, static YAML invariants and negative-command checks passing; this reviewer did not rerun unchanged checks. During this review the conductor additionally reports successful actual Caddy2.11.7 Windows AMD64 binary adaptation/module validation, with official archive checksum matched and version confirmed; private output remains in ignored local custody. That validates this Caddyfile's parsing/module configuration, not the future Linux image, certificate issuance, listeners or renewal. Docker Compose, image build, mounted credential access, HTTPS issuance and installed behavior have not been demonstrated. No new permission request is needed for this unblocked source preparation.

## Independently matched SHA256 roster

```text
infra/sandbox/compose.yaml a65589431356a96b67f3230f862ac4c82771e97fff1dbdcbadb5929349234919
infra/sandbox/Caddyfile 33474d05490e9e53d3ec40e83102a2f426a85c648557e049e481cc735f5175b7
infra/sandbox/sandbox.env.example 60fa2ae5dc11f71a468ea1b804164cf4385a9490224572517f92d20326ac267b
infra/sandbox/Dockerfile.api 3a07fe740085a458946d53475aa93b70c40c560ba716f962556ac475ea272871
tools/sandbox/deploy.sh b9c657e5e43fe07cfdb91918c3cec8606650e00e6e93134eaf8b3b93476ec28b
tools/sandbox/verify.sh 86fb14b8fb7e6801c94942ac9c8965c173a419b81474b1a80e9fd30e05f3b603
docs/ops/SANDBOX.md 7aad977e87b0edee0bc146c836faed89d85cb50985d103a3f0685ee0f3eeeb62
```
