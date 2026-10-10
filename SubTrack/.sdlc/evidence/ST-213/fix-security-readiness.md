# ST-213 security/privacy fix readiness (2026-10-10)
Verdict: READY_TO_IMPLEMENT Type 2a repair; the plan closes both source-review design blockers without changing accepted auth authority or requiring a founder decision.
Reuse the existing `JwtService.verify` claim/algorithm body through a public-key-only Ed25519 capability; preserve existing constructor/signing behavior and exclude issuing from the local entry.
Require a private wrapper-owned record tied to the full fresh `docker create` CID; direct entry must independently inspect exact ID, unique label, creation time, running PG16 image, tmpfs mount, and sole random numeric loopback binding before Prisma/listen.
Match reader URL host, port, database, and role to that inspected fixture; marker, label, name, or expected role/database alone cannot establish provenance. Keep ordinary-role and RLS preflight on the same client.
Bound Nest init/close, Prisma disconnect, and child shutdown; clear timers, sanitize errors, and verify container and temporary-file cleanup.
Implementation evidence must include direct-entry forgery/stale/mismatch rejection, cleanup timeout, retained HTTP security tests, and independent actual-PG QA.
This is plan readiness only; parent acceptance, changed-source reviews, coverage, and green exact-head gates remain required before merge.
