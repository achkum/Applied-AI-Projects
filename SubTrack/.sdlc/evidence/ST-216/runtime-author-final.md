# ST-216 runtime author handoff — 2026-10-10

Original attempt 1 started 18:26:27 UTC; context rotations did not reset attempt, failure, review, or time counters. Runtime source and adjacent unit specs are stable for exact-head review. Root owns commit, CI, and merge. The fixture author owns actual PostgreSQL HTTP proof.

The direct launcher verifies a private owner-only provenance record against the exact running Docker CID, fresh label and creation time, approved PG16 image, sole tmpfs data mount, sole numeric loopback binding, and exact full credential-bearing runtime URL before constructing Prisma. It refuses production, public bind, missing key, malformed fixture, and mismatched role/database/port. A startup deadline now attaches a second close to a listener that binds after timeout. The isolated Nest composition uses the accepted global principal guard, current-session resolver, ordinary-role pool, RLS and UPDATE preflight, read surface, and locked lifecycle writer. Its route enforces exact status-only JSON with no query and projects bounded problem responses.

Verification at the current worktree source:
- Focused Vitest: 4 files, 71 tests PASS. V8 coverage (statements / branches / functions / lines): controller 100 / 96.29 / 100 / 100%; service 100 / 100 / 100 / 100%; composition 97.91 / 100 / 92.85 / 100%; local entry 90 / 92.55 / 81.25 / 96.82%. Tests include controlled late listener, late Nest creation and initialization, provenance geometry, startup ordering, actual Nest requests, and cleanup.
- API ESLint PASS; `tsc --noEmit -p tsconfig.json` PASS.
- Full API `corepack pnpm test`: 70 files, 1374 tests PASS. The first local run failed solely because `openssl` was absent from PATH; rerunning with installed Git OpenSSL on PATH passed without source or test exclusions.

This handoff does not claim an actual PostgreSQL fixture run, container Node22 smoke, CI, or independent exact-head approval. No credential, token, runtime URL, raw driver error, or personal data is recorded here.
