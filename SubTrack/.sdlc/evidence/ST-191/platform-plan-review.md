# ST191 platform architecture review (plan only)

**Decision: APPROVE as Type 2a architecture, conditional on the explicit ST190 merge gate and the constraints below.** The proposal adds internal session-row metadata and repository ports within the existing auth/session subsystem. It preserves the accepted v2 wire contract and browser proof model, introduces no new dependency, package, API contract, storage system, or lifecycle. This is reversible cross-module architecture under `docs/governance/DECISION_RULES.md` §1 Type 2a. I see no Type 1 change provided implementation remains within the stated boundary.

## Decision-rule and ADR fit

The Constitution prioritizes accepted ADRs and requires conflict escalation; ADR-0010 is explicitly “Accepted — contract-only” and says it does not approve runtime implementation/migration/rollout. ST191 is internal implementation, and its plan explicitly excludes HTTP/routes/contracts. The plan aligns with ADR-0010: session proof retains the existing independent `browserChainId`, web nonce remains terminally consumed, cookie binding and exact Origin are checked, and CSRF stays a separate future HTTP-adapter concern. This does not amend ADR-0010 or authorize a wire change.

Evidence from the plan: “Preserve original independent chain and authoritative existing session repository”; “Successful redemption terminally consumes the nonce without issuing a successor” (ADR-0010); ST191 calls out “This preflight is NOT rotate/CSRF atomicity, no token issuance or callerprincipalclaim.”

## Exact accepted scope

Approve only the planned optional server-only `browserBindingCookieHash` on the authoritative existing `SessionRecord`, using domain-separated SHA-256 over a canonical 32-byte base64url cookie. It is compatible to keep legacy internal issuance calls that omit it. Newly introduced web-cookie lookup must reject missing bindings with no fallback. Copy and validate the hash through existing row copying and principal resolver copying, require exactly 64 lowercase hex characters, and reject it on mobile rows. Preserve it through rotation, revocation and consumed tombstones until the original session expiry; owned-row deletion must clear it together with the existing row/tombstones. No raw cookie, new registry, altered expiry/TTL/capacity, or public serialization is accepted.

The web current-session lookup must be scoped by verified JWT-derived `RequestContext`, and must match active owner, live session, web transport, full cookie hash and exact Origin before returning only the frozen stored `{transport, exactOrigin, browserChainId}`. It is a context resolver only; it cannot establish a principal. Protected requests still resolve/recheck the current principal and current row. Missing/legacy/malformed/foreign/expired/mismatched bindings fail closed without mutation.

The refresh lookup is an explicit credential-authentication boundary: input is the refresh-token hash plus cookie hash, exact Origin and observed time, and it derives identity/session from the authoritative active row or matching retained consumed history. It must return only verified identity/session and the minimal web transport context. A consumed credential may select the existing reuse-family-revocation handling path only; it must never authorize an active principal or mint credentials. Mismatches remain non-mutating. The future adapter may use this result to check session CSRF, then call existing atomic rotation, which must independently recheck credential hash, full transport and current ownership. No claim of atomicity across the preflight and rotation is approved.

## Boundaries and merge gate

Permitted source scope is only existing `issuer.ts` and `principalresolver.ts`, plus the specified new `v2-web-session-binding.ts` and colocated spec, and ST191/190/170c/board/evidence metadata. No HTTP module/controller, configuration, contract, provider, database, dependency, barrel export, or wire output changes. Tests must exercise real terminal nonce consumption and the actual issuer/session repository, then prove row lookup, refresh preflight and real rotation/reuse behavior; also prove current principal resolution rejects revoked/deleted state and all stated mismatch/no-mutation cases.

Hard sequencing condition: ST191 source work starts only after ST190 has finished source, QA, source approval and published an immutable candidate; no concurrent edits to the shared issuer. ST191 merge is gated on accepted ST190, tree proof/reconciliation, full QA, source approvals and ST191 CI. If that candidate cannot be established, do not start source work.

## Evidence snippets reviewed

- `CONSTITUTION.md`: Article 2 says accepted ADRs rank above task contract; Article 3 requires tests with every change and rejects invented contracts.
- `DECISION_RULES.md` §1 defines Type 2a as reversible cross-cutting architecture (e.g. schema/API changes) decided by relevant architect; Type 1 includes security-model changes. The proposal leaves the security model and wire contract intact, so Type 2a applies.
- `ADR-0010.md`: accepted, contract-only; no runtime implementation approval; v2 web proof must match trusted nonce/cookie chain and terminally consume nonce.
- `browser-nonce.ts`: `consumeSession` removes and returns only a matching live session-purpose row; guard requires the terminal store port and validates the returned row before returning a frozen context.
- `issuer.ts` existing `copyRecord` currently snapshots required session fields and permits web `exactOrigin`/`browserChainId`; this is the clear insertion point for optional strict hash copying. Existing session insertion records proof transport context and uses repository ownership checks.

**Approval classification:** APPROVE (Type 2a), with the explicit scope and sequencing conditions above. No independent HTTP atomic-claim approval; no Type 1 authorization is implied.
