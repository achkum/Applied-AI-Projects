# ST170c3 security and privacy review

**Decision: APPROVE** — limited to the internal CSRF core and its process-local in-memory reference store, as reviewed at source HEAD `0fa56816bae7cdc8d5f34341166c9cb117e96f48`.

## Evidence reviewed

- `.sdlc/tasks/ST-170c3.md`, repository `AGENTS.md`, and `docs/governance/CONSTITUTION.md`.
- Accepted contract-only `docs/architecture/adr/ADR-0010.md`, the `packages/contracts/openapi.yaml` session CSRF fields, and `/workspace/.setup/ST170c3-proposed-contract.md`.
- `apps/api/src/auth/session-csrf/session-csrf.ts` and its adjacent spec.
- Existing test log `/workspace/.setup/ST170c3-tests.log`: 10 tests passed; reported 100% statements, branches, functions, and lines. This review did not rerun tests or independently validate lint/typecheck.

## Findings

The core generates each token from 32 cryptographically random bytes and encodes it as base64url, yielding the expected 43-character opaque value. Its syntax check rejects malformed lengths and characters. Token, identity, session, and binding hashes use distinct domain labels. The identity and session digests are length-framed before forming the binding digest, avoiding concatenation ambiguity. Stored records contain only fixed-length lowercase SHA-256 digests; the in-memory store copies and freezes records and diagnostic snapshots. No raw identity, session ID, or token is included in store state or errors.

Verification hashes the supplied token and uses `timingSafeEqual` on two validated, fixed 32-byte digest buffers. Authority and token failures, unknown or stale bindings, malformed store results, and thrown store operations are normalized to the same secret-free error. Rotation replaces the current binding record synchronously; verification does not consume a token, so the current token can validate repeatedly. Reissue at capacity preserves the binding, while insertion of a new binding fails closed. Explicit invalidation deletes only the supplied binding. The tests exercise these properties, including wrong identity/session bindings, rotation, nonconsumption, capacity, store failures, and copied/frozen state.

`VerifiedWebSessionAuthority` is a compile-time brand only. Runtime validation checks a strict own-property shape and bounded nonblank identity/session strings, but it cannot establish their provenance or prove that a session is active. The comments and task contract correctly reserve that trust for a separately reviewed server adapter. This review does not approve an adapter, HTTP/Origin/TLS enforcement, cookie or bearer selection, active-session validation, durable or cross-process atomic storage, lifecycle expiry, production deployment, or end-to-end CSRF protection. The store remains process-local and requires explicit session-lifecycle integration for invalidation/reissue.

## Severity

No blocking or high-severity issue found within the reviewed scope. No source changes requested. Approval is limited to this internal core and its in-memory reference store; parent ST-170c and production readiness remain incomplete.
