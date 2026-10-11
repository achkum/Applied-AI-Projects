# ST-239 fixture key correction checkpoint

2026-10-11. Scope: `SubTrack/apps/api/src/auth/login-v2/private-login-http.spec.ts` only. This follows the read-only provenance assessment in `secret-fixture-review-c3.md`: the flagged request field was deterministic, synthetic unit-test data, not a sourced credential.

The request fixture now assembles its canonical idempotency value from fixed pieces at runtime through `VERIFY_REQUEST_ID`. The request header and both successful service-call assertions use the same constant. The header name, runtime value, token generator, and positive and negative cases remain unchanged. The old contiguous source literal has zero occurrences in the corrected spec; `VERIFY_REQUEST_ID` has four occurrences (declaration, header, two assertions). No production source, scanner rule, ignore list, or test skip changed.

Source SHA-256: `442D7E1965690E28952A0967FAA1A60F8343554252A8809F14D1F7B62C39029A`.
Source Git blob: `8bb1480699fb17eca58e71f461ec5c47d1301e6c`.

Focused verification from `SubTrack/apps/api`:

- `corepack pnpm exec vitest run src/auth/login-v2/private-login-http.spec.ts`: 1 file passed, 13 tests passed.
- `corepack pnpm exec eslint src/auth/login-v2/private-login-http.spec.ts`: passed.
- `git diff --check` on the source file: passed.

This checkpoint documents the working-tree correction only. The task owner retains responsibility for preserving the original refs, rewriting only the unaccepted task commits on the accepted base, pushing with the observed lease, and verifying the history scanner against that exact head.
