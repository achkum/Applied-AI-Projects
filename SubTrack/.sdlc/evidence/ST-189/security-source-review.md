# ST-189 security/privacy source review

**Decision: APPROVE**

The reviewed source implements the approved terminal session nonce boundary. `consumeForSession` fixes purpose to `session`, reuses canonical origin and transport validation, validates the nonce/cookie formats and safe TTL arithmetic, and calls only the optional atomic `consumeSession` adapter port. It does not fall back to peek or rotation. The in-memory transition checks clock validity before pruning, verifies the exact nonce/cookie/origin/purpose/time window and five-minute TTL, then synchronously removes only the matching row and returns no successor.

The guard validates the trusted adapter outcome against the expected hashes and origin, session purpose, nonempty chain, and complete time window. The descriptor-based method lookup rejects accessors without invoking them and binds the adapter receiver. The record snapshot rejects non-plain objects, accessors, hidden fields, symbols, extra fields, and inherited properties without reading accessors. It returns a separately frozen minimal context containing only chain, origin, and fixed purpose. Failures are normalized; there is no restore or retry path.

The focused spec covers terminal consumption and replay/preflight/rotation denial, purpose/origin/cookie mismatches preserving live rows, unsafe/backdated/expired clocks, unrelated-row isolation, both terminal race orderings, missing port fail-closed behavior, malformed adapter results and accessor safety, receiver preservation, and HTTPS/explicit loopback evidence. The primitive does not claim atomicity with proof consumption or session persistence, and makes no HTTP/session exchange claim.

Review basis: `.sdlc/tasks/ST-189.md`, `docs/governance/CONSTITUTION.md`, `.sdlc/evidence/ST-189/security-plan-review.md`, `apps/api/src/auth/browser-nonce/browser-nonce.ts`, and `apps/api/src/auth/browser-nonce/browser-nonce-session.spec.ts`.

Source SHA-256:

- `apps/api/src/auth/browser-nonce/browser-nonce.ts`: `2599c6dba76d59026d94d6bbe31fe4a97a28c197be7653b25beb49e392953daa`
- `apps/api/src/auth/browser-nonce/browser-nonce-session.spec.ts`: `5293b7d17b724b90eb6835b7621cf8232f804134af1188b4d45fe4db191ef628`

HEAD: `847da09123f026c4c32dfb2d6752ff3303f1d2b3`. The worktree has pre-existing task changes including the reviewed source/spec and the created `.setup/` review artifact; I made no source edits and ran no Git mutation. The complete worktree status was captured during review. Actual tool-call count: 5 (three independent reads, one batched Constitution/source-hash/status capture and artifact creation, one artifact hash/status completion). Handoff is this final response. This review does not claim QA or CI completion.
