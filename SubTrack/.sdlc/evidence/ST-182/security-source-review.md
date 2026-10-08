# ST-182 security source review

**Disposition: APPROVE** for the bounded development/test reference only, subject to the existing task and separate runtime gates.

The issuer snapshots caller input and transport context by own property descriptors before collaborator calls, validates strict proof syntax and the clock, and derives `userId` only from a successful `consumeLogin` result. Constructor gating is explicit, and trusted collaborator methods are captured once. The context is frozen before use; the in-memory repository performs active-identity, scope, record, collision and capacity checks plus insertion synchronously. Its deletion operation synchronously removes the registration and that identity's records, so the consume-to-insert race has a clear linearization point.

Repository writes validate canonical UUID strings without coercion, exact 24-hour expiry, safe timestamps, transport metadata and hash shape. Pruning uses the repository's trusted clock and occurs only after the new record has passed timestamp and owner/active checks, so supplied timestamps cannot evict records. Reads require owner scope, current active registration and a nonexpired record; caller read time cannot be in the future relative to repository time. Session and identity bounds are enforced. Only the domain-separated refresh hash is stored. The issuer checks distinct canonical session/family UUIDs, 32-byte refresh randomness, canonical `v2r.` encoding, and bounds the returned access-token string.

On false or thrown/ambiguous creation and on token issuance/validation failure, the issuer attempts rollback using the generated record and frozen owner context. Repository rollback checks identity, session, family and refresh hash before deletion; mismatched rows remain. Errors collapse to `Session unavailable`, and the issuer returns no credentials on failure. If rollback fails, any reference record remains subject to the fixed 24-hour expiry. No raw proof or refresh credential is stored or logged in this path.

The spec source exercises simulator producer → ProofStore → issuer → V2AccessToken verifier for web and mobile, plus replay/concurrent consumption, deletion before create, strict snapshots and bindings, clock validation, collisions/capacity/corrupt records, token/create failures, rollback preservation/failure, and hash-only storage. These are source-reviewed assertions; this review did not run tests or other QA. The code remains unwired, with no durable or multi-process atomicity claim and no production refresh-policy claim. ST-170b/c and the HTTP, CSRF/idempotency, durable storage and rotation gates remain open as stated in the task and ADR-0010.

Reviewed source SHA-256:

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.ts`: `05b63c967aa980a534f3189822d3fd5df22067a96b67f05589c3678c6cd58fe1`

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-issuer.spec.ts`: `7d0189e0e305b185eaedc1d160bdef24af657e61c2cd76a4cb376be7a02fdba3`

Actual calls: 5 total (three bounded source-read/search commands, one failed artifact-write attempt because `.setup` was absent at the repository-relative location, and this corrective artifact write to the requested absolute path). QA commands run: none. No tests, lint, typecheck, build, Git operation, source mutation, or configuration mutation was performed.
