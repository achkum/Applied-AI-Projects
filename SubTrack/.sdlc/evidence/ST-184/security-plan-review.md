# ST184 security preimplementation review

**Decision: APPROVE with implementation conditions**

Reviewed the ST184 task draft, repository instructions, Constitution, accepted ADR-0010, and the accepted ST182 issuer and ST183 resolver sources. ADR-0010 remains contract-only. This approval is limited to the proposed synchronous in-memory internal repository seam; it does not authorize a refresh service, HTTP/runtime integration, durable storage, or a client-readiness claim.

## Security assessment

The credential-hash lookup can safely authenticate refresh possession inside the synchronous atomic boundary, even though the operation has no caller-supplied owner selector. Treat it as a credential-authentication boundary, not an unscoped data read: after finding an active row or consumed tombstone, derive the owner only from that stored state, construct a frozen `RequestContext` from its stored identity, and never return a row or tombstone. The rotated outcome may disclose only the identity/session/family IDs and fixed expiry explicitly required by the task. Reused and invalid outcomes must not disclose owner or row details.

This boundary preserves ST182's owner-scoped create, rollback, read, and deletion APIs while allowing the refresh credential itself to establish the principal. Document this distinction at the method and repository level. Parse the exact own-data shape and canonical lowercase 64-hex hashes before mutation. Do not add caller identity, session, or family selectors.

The synchronous method can provide the required in-memory linearization point if it performs no await and completes validation, trusted-time acquisition, lookup, owner/transport/lifetime checks, collision/capacity checks, tombstone insertion, and replacement/revocation as one operation. Call and validate the repository clock before pruning or mutation. Require safe nonnegative integer time; reject observed time later than trusted time; enforce `createdAt <= observedAt <= trustedNow < expiresAt`. Keep expiry exactly the original 24-hour expiry and preserve generation 0 and all other session metadata. Refresh rotation alone must leave already-issued access tokens valid; family revocation/deletion/expiry must be visible through the resolver's shared `readSession` path.

For consumed-token reuse, verify the original transport against the tombstone's stored transport binding before revoking anything. Wrong transport, origin, or browser chain must return invalid without consuming, revoking, or revealing the owner. The tombstone therefore needs enough immutable owner, family, expiry, and transport-binding data to authenticate a replay after the active row changes or is removed. A matching replay with an active, live original owner must revoke all rows in exactly that owner/family and return reused. An inactive/deleted owner or expired credential must not trigger reuse revocation.

Retain consumed hashes through their original session expiry, including after reuse revocation or rollback, so stale credentials cannot become valid if other session state changes. Prune them only using trusted repository time, and remove the owner's tombstones when deletion permanently disables that identity. Enforce the tombstone bound (default 10,000 and test override 1–10,000) and all active/tombstone collision checks before consuming the current credential. At capacity or on collision, return invalid and leave the old active credential usable. New-session creation must also reject hashes present in unexpired tombstones.

The post-commit cleanup method is acceptably narrow if it validates exact own-data input and owner context, and removes rows only when identity, session, family, and current successor hash all match. It must not restore or erase the consumed credential, and must preserve unrelated families and owners. This is only compensation for issuance failure in the in-memory reference; it does not establish durable rollback semantics.

The specified same-hash race behavior is coherent for the synchronous implementation: one call rotates; the competing call sees the consumed hash and revokes that family. The first returned result reflects its commit point, not continuing ownership. Tests should use the same repository instance with the real issuer/access-token/resolver path to establish that family revocation denies both old and current access tokens while unrelated same-owner families and neighboring-owner sessions still resolve. Use ephemeral signing keys and avoid printing token/hash values.

## Implementation conditions

1. Keep all active and consumed credential state inside the existing repository; do not add a disconnected lifecycle store.
2. Keep the operation synchronous and no-await, with the full checks and mutation in one linearized boundary.
3. Freeze every outcome and every internally constructed owner context; never return unscoped rows or tombstones.
4. Preserve stable session/family/identity IDs, generation 0, metadata, and original fixed expiry on rotation.
5. Validate transport before any reuse-triggered revocation; retain bounded tombstones until original expiry, with trusted-time pruning and deletion cleanup.
6. Keep `revokeRotatedFamily` tuple-scoped and limited to cleanup after successor commit.
7. Keep the deliverable within the draft's listed source/spec paths and in-memory scope; future durable adapters require a separate transaction/serialization design and review.

## Limits

This review does not verify implementation, tests, CI, repository merge state, or the ST183 in-progress status. It makes no claim about HTTP extraction, CSRF, idempotency, server-side refresh-secret production, durable concurrency, deployment, or production security. Source work remains gated on prerequisite acceptance as stated in the task draft.

## Review accounting

Actual tool calls used: **5** (4 prior calls plus this corrective artifact-write call). The prior calls were workspace/file discovery; batched reads of AGENTS.md, the ST184 draft, and accepted issuer/resolver sources; batched reads of the Constitution, ADR-0010, and ST184 plan/dispatch; and one failed artifact-write attempt. The fifth call wrote this artifact. No source edits, Git commands, QA, tests, environment/configuration changes, or subagent work were performed.
