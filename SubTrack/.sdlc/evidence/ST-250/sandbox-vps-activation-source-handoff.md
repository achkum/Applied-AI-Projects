# ST250 VPS activation preparation source handoff

2026-10-14. Nine changed frozen files plus unchanged reviewed Dockerfile listed below. Source preparation only; no Docker/VPS execution, real secret creation, deployment/Git mutation or publication. Independently reviewed same-image qualification/transfer contract remains pending; initialize/bootstrap/activate explicitly exit2 before any mutation.

| App-relative path | SHA256 |
| --- | --- |
| `infra/sandbox/compose.yaml` | `ece14b43c90bcde5d256f36f46c9993bd08579bbef73d9600c91049efc754faf` |
| `infra/sandbox/Caddyfile` | `af5d332a69c2f9c0aa93b8aec167c4015ba119f7392a06b8d499ae62b377a47b` |
| `infra/sandbox/sandbox.env.example` | `859f62423702f86edd5fbc68a1a3209cf12946799275f35e6d15a31c0f0c79e7` |
| `infra/sandbox/Dockerfile.api` | `0d16d1928f824e588e56c4115a86b2333169272f51cc9cccbcd606384f5f8719` |
| `tools/sandbox/deploy.sh` | `7b74e5a78dbfdc4e320f0c66dfbdd8369de4fe4ce233331197656105bbdcfc84` |
| `tools/sandbox/verify.sh` | `7978fbcfcd7a9f5f48fd09a33948bdcb6ba5b5d5538cd2ddd6b45158f27a7d27` |
| `docs/ops/SANDBOX.md` | `b2105ec9a1ba7e9c88c8257f4f44d1bc1bdfcc8af364d6ca2b64b619f3b50373` |
| `tools/sandbox/bootstrap.cjs` | `fb3af68f746176a40e2fd1b827ce1ff6f330dce9f9453e6017e0e4df964165cd` |
| `infra/sandbox/gateway-entrypoint.sh` | `714dd88ab57d1a3b29e980fcbdbdc1832a10e75447b40ea73a40e1f35aa7eeea` |
| `tools/sandbox/activation-contract.test.cjs` | `81775700de1a6d606bcf423ccfa3cf820c1f94f573349179f23fa36eddcf4242` |

Default Compose starts nothing; prepared services retain false flags/no ports. Distinct live API/gateway profiles and separate one-shot loader preserve production-mode runtime tuple,736MiB either-graph budget, private database/ingress and gateway-only edge. Only live gateway publishes80/443; API/database stay unpublished. Loader-only UID1000 bootstrap copy and gateway-only key exclude administrator/API key portfolio from live gateway/API. No source image entrypoint substitution or provider routes.

Final preparation correction: actual pg_isready healthcheck with bounded5s/3s/20s/12 timings and service_healthy dependencies prevents loader/API startup racing initial PostgreSQL readiness. Updated only Compose hash; actual merged YAML readiness assertions PASS. No startup performed.

One-shot source supports explicitly owned empty secrets generation, exclusive0600 writes and exact999/1000 UID separation; partial creation never regenerates. Install uses actual compiled loader/hash manifest, exact PG16/db/bootstrap login and empty schema/role/catalog guard, unchanged two migrations, ordinary password only, closes admin before ordinary startup verification. No arbitrary SQL/database target or destructive reset/compensation.

Gateway source rejects absent/wrong mode/owner/symlink/key shape with fixed failure, exports only gateway material then execs Caddy. Caddy uses explicit issuer, no admin/access logging, publication expression default false, exact five POST routes/no query (including bare question mark),8KiB body limit, pre-proxy untrusted sandbox header stripping then exact canonicalHost/key/socket-source construction, forwarded metadata deletion and bounded transport. Actual final pinned Caddy validation and malicious boundary probes are still required; earlier root probe established header-order approach only.

Checks actually run: bootstrap Node syntax PASS; three focused contract tests PASS (portfolio isolation, secret custody/directory/absence and Linux-only uid/mode/symlink checks, fixed unknown-command rejection). Windows uid/mode/symlink branches are intentionally not claimed as executed. Bash syntax for deploy/verify/gateway PASS; actual deploy activate rejects exit2 before Docker/remote action; actual YAML2.9.1 with merge enabled passes six-service/profile/no-public-API/separate-admin/gateway-key/internal-network assertions. Initial YAML assertion omitted merge support and failed before corrected parser call; no Compose execution claimed. Test-generated ephemeral cryptographic material is destroyed/in-memory and never emitted; no deployment keys generated.

Remaining concrete source/execution work: same-image persistent PG qualification and authenticated-transfer schemas, bounded exact-owned volume/secret initialization/resource collision checks, mounted-user readability, final Compose/pinned Caddy probes, then reviewed deployment gate activation. Current source deliberately does not invent those receipts or authorize remote commands. Android/iOS native composition/device gates remain separate. Independent platform/privacy review of this author-owned preparation is required.
