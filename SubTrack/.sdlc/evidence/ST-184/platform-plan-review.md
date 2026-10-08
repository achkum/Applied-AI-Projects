# ST184 platform preimplementation review

Decision: APPROVE, with the contract conditions below. This review assesses the proposed in-memory lifecycle seam only; it does not approve ST185 or runtime/API wiring.

## Basis

Reviewed the repository instructions, Constitution, ST184 task draft, existing `v2-session-issuer.ts` and `v2-principal-resolver.ts`, and ADR-0010. ADR-0010 is marked accepted and does not conflict with the proposed narrow repository boundary. The draft correctly calls for an explicit platform/security approval of principal derivation before implementation.

The existing repository currently has only active session rows and the original three constructor parameters; lifecycle methods and tombstones do not yet exist. The proposal is implementable while retaining those first three constructor parameters and adding only the optional tombstone-capacity parameter. The existing resolver authorizes against its reader’s current-owner read, so reuse revocation will invalidate access JWTs only when it shares the same repository state.

## Contract conditions

- `rotateRefresh` is an internal credential-authentication boundary: accept only exact own-data input with distinct lowercase 64-hex hashes, transport context, and observed time; accept no caller identity, session, or family selectors. Hash lookup, owner derivation from the matched stored active row or consumed tombstone, frozen `{ userId: stored.identityId }` context construction, transport/lifetime checks, collision/capacity checks, tombstone insertion, and row replacement/revocation must occur synchronously and atomically with no `await`. Document this boundary separately from owner-scoped reads, creation, rollback, and deletion.
- Preserve generation `0`, identity/session/family, metadata, original creation time, and the exact original 24-hour expiry when replacing only the active refresh hash. Existing access tokens remain valid until family revocation, deletion, or expiry.
- Retain consumed hashes through original expiry, including after rollback/revocation. A matching consumed hash with matching transport and a live active owner revokes the whole owner/family and returns `reused`; mismatched transport/origin/chain returns `invalid` without consuming, revoking, or revealing ownership.
- Check successor collisions against active and unexpired consumed hashes and check tombstone capacity before consuming the current active token. On either failure, return `invalid` and retain the old active token. Prune only from validated trusted repository time; validate inputs and clock before pruning. Keep the first three constructor arguments unchanged.
- `revokeRotatedFamily` must match the exact owner/session/family/current-successor-hash tuple and remove only that owner/family. It must not restore a consumed credential. Deletion removes the identity’s rows and tombstones and makes the identity inactive.
- Keep all issuer, lifecycle, and resolver operations on the same authoritative repository instance. Test web and mobile flows, concurrent reuse, neighboring identities and families, deletion, malformed/exotic inputs, collision/capacity behavior, trusted-time pruning, retention, and cleanup. Tests must not emit secrets; use ephemeral signing keys.

## Limits

This approval covers a synchronous in-memory reference only. It grants no claim about durable transactions, adapters, HTTP behavior, CSRF, idempotency, transport producers, production readiness, deployment, or client-ready authentication. Those remain separate gates.

Tool calls used: 4 cumulative (three initial calls plus one corrective artifact call).
