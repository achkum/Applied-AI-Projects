# ST191 security/privacy plan review

**Disposition: Approve with required plan clarifications; Type 2a is appropriate.** This is an additive internal seam across the v2 issuer/repository and principal resolver, with no public contract, database schema, dependency, or security-model relaxation. ADR-0010 already fixes the relevant invariants: web sessions bind to a nonce-established browser chain and exact origin; nonce redemption is terminal; cookie calls need separate session CSRF; refresh rotation is atomic and reuse revokes the family. The proposed lookup ports do not replace those guarantees when implemented as described.

## Security boundary and required constraints

1. `browserBindingCookieHash` is acceptable only as an optional server-only value supplied by a future trusted adapter after it verifies the nonce, binding cookie, exact Origin, and obtains the matching trusted chain. Keep canonical 32-byte base64url input validation and a distinct fixed hash domain. The issuer must validate the input before consuming proof, must never accept it from HTTP/body/client-controlled context, and must not expose raw cookie or hash in tokens, summaries, logs, errors, or wire outputs. Legacy internal issuance may omit it; every new cookie-web context lookup must fail closed for rows without it. Mobile records must reject it.

2. Existing record ownership and lifecycle remain authoritative. Copy and validate the optional 64-character lowercase hash when records cross repository boundaries. Rotation retains it on the active row and prior-token tombstone; revocation retains it through the original session expiry. Do not extend expiry, create a new registry, or add independent cleanup/lifetime behavior. Existing identity deletion must remove owned rows and tombstones, including this field. Expiry pruning may only use the existing expiry and should not turn a failed lookup into a mutation.

3. The current-owner lookup may accept `sid` only alongside a verified-JWT-derived readonly owner context; it must check ownership, active identity, row liveness/time bounds, web transport, exact origin, and full binding hash, then return only the stored chain in a frozen minimal transport object. It is a transport-context recovery helper, not an access principal. Protected requests still pass through the principal resolver, which rechecks the credential and current row.

4. The refresh lookup derives identity and session solely from the matched active row or retained consumed-token tombstone, after matching refresh-token hash, binding hash, origin, active owner, and time. It must return only identity/session and minimal web transport context, and must not mutate on mismatch or reveal family/expiry/hash. Consumed history is needed only to authenticate the CSRF context for the existing reuse-family-revocation path. The lookup is a credential-authentication preflight, not rotation, token issuance, active-principal authorization, or HTTP atomicity. The subsequent existing `rotateRefresh` must recheck token hash, full transport, owner, and current state atomically.

5. Preserve strict object snapshotting and frozen outputs across new inputs/results; reject accessors, symbols, extra keys, malformed hashes, invalid dates, and cross-transport values without state mutation. Keep the independent browser chain unchanged; never reconstruct it from cookie data.

## Decision classification and gate

The plan's Type 2a classification is aligned with DECISION_RULES §1 because the change adds an internal cross-module authentication seam with repository lifecycle consequences. It is not Type 1 as long as the above constraints hold: the optional field adds no authority, wire behavior, persistence schema, or lifetime and all existing checks remain authoritative. The architect should explicitly approve the compatibility behavior, the trusted-adapter-only hash input boundary, and the consumed-history refresh-authentication use before source work. Security/privacy approval here is conditional on those constraints and is not an HTTP integration or production rollout approval.

**Hard sequencing gate:** do not begin ST191 source edits until ST190 is source-finished, QA-complete, source-approved, and published as the immutable candidate. Do not edit the shared issuer concurrently. ST191 merge remains gated on accepted ST190, tree/candidate reconciliation, full QA, source approvals, and its own CI, as stated in the plan.

## Evidence reviewed

Read ST191 plan, repository `AGENTS.md`, Constitution, Decision Rules, ADR-0010, v2 issuer and principal resolver, browser nonce store terminal-consume path, and v2 refresher. Current implementation has owner-scoped `readSession`, strict record copying, session expiry validation, and terminal nonce removal; the principal resolver validates current session ownership/transport/chain. The proposed additions fit those boundaries if implemented with the constraints above.
