# ST-213 repaired platform source review (2026-10-10)
Verdict: REQUEST_CHANGES; source-only review, actual PostgreSQL/HTTP and Linux `--serve` proof pending.
Reviewed blobs: composition `82a021b4f6a2616133b999d51e85b35d02e83c02`; local entry `04f9c89bba43d93cd6256da1e7b1559e1163ac03`.
Reviewed blobs: JWT `210bb89c2b65d208c6900d3215df307ec0467e25`; wrapper `4d49aca52be5f1d09f70ff11aab19e5038a26414`; HTTP proof `d453465fa52313f4c7f6937c941b1794cd1be1a3`.
The direct entry checks a private record against an exact running CID, fresh unique label, PG16 image, tmpfs mount, loopback port, and matching ordinary-role URL before Prisma. The wrapper creates that record from its own container.
Local JWT verification now uses the existing shared verification function with a required Ed25519 public key; no local issuer or private-key generation is exposed.
Factory creation/init/close and Prisma disconnect have deadlines, including late create/init cleanup; wrapper child shutdown has a deadline and forced termination.
Blocker: the wrapper requests a random host port with `--publish 127.0.0.1::5432`, while the entry requires the requested `HostConfig.PortBindings` HostPort to equal the allocated `NetworkSettings.Ports` HostPort. The unit mock supplies the allocated port in both fields, so it does not prove the actual Docker shape; an empty requested HostPort would reject every real `--serve` launch. Check a real Linux inspect and accept its safe shape.
Blocker: `.github/workflows/subtrack-subscription-read-proof.yml` invokes proof mode only. There is no Linux positive `--serve` run showing mode-0600 provenance, actual listener startup/stop, and verified cleanup; add that evidence before platform approval.
The integration test uses the same factory and retains HTTP role/RLS/privacy/cursor/bigint/revocation/pooled-GUC assertions, but this reviewer did not run PostgreSQL (Docker unavailable here).
Parent acceptance and exact-head gates remain pending; no feature-availability or merge approval from this review.
