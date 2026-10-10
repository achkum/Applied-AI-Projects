# ST-213 first source-review fix plan (2026-10-10)
Verdict: Type 2a repair within ADR-0022; no issuer, provider, cookie bridge, persistent DB, default graph, or web exposure.
1. Extend ST-213 allowed paths to `apps/api/src/auth/sessions/jwt.service.ts` and `.spec.ts` before implementation; both are outside the current task boundary.
2. Extract the existing `JwtService.verify` body into one shared verifier using an Ed25519 public `KeyObject`; retain current constructor, signing, and default behavior for existing consumers.
3. Expose a public-key-only verifier factory that rejects absent/non-Ed25519 trusted PEM and has no `issue` method or private-key generation; local entry obtains only this capability.
4. Remove `trustedVerifier` and its separate JWT parser from the local entry; do not accept a configurable verification stub there.
5. Wrapper writes a mode-0600 provenance record in its private directory from the full CID returned by its own successful `docker create`, with unique task label and creation time.
6. Before opening Prisma or listening, direct entry requires that record and independently inspects that exact CID: fresh running PG16 image, unique label, tmpfs data mount, and sole random numeric `127.0.0.1` host binding.
7. Parse the reader URL and require its host/port/database/role to equal the inspected binding and fixed fixture values; reject other hosts, alternate endpoints, and any mismatch. Keep ordinary-role/RLS preflight on the same Prisma client.
8. Treat URL, marker, expected role/database, or a user-supplied label alone as insufficient provenance; wrapper supplies and removes the private record with its existing verified cleanup.
9. Bound Nest creation/init and close, Prisma disconnect, and wrapper child shutdown; sanitize errors, clear timers, and let wrapper cleanup proceed after a timeout.
10. Test the actual local launch against direct invocation, forged/stale/mismatched records and URLs, wrong image/mount/bind, missing key, and cleanup timeout; retain real PG HTTP role/RLS/privacy tests.
11. Repeat independent platform/security source review, actual PG QA, coverage and exact-head gates; parent acceptance remains required before merge.
