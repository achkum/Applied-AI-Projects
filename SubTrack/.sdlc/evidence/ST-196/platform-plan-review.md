# ST196 platform plan review

**Decision: Approve as Type 2a, subject to the conditions below.** This adds an opt-in versioned API operation and crosses the HTTP, principal, token, and session repository boundary, so it is a reversible architecture/API-contract decision under `DECISION_RULES.md`. The accepted `/v2/me/sessions/{id}` DELETE operation in `packages/contracts/openapi.yaml` already defines caller-owned revocation; implementing its mobile bearer branch does not change the accepted security model or product scope. No Type 1 trigger is present provided implementation remains development-only and does not alter runtime defaults, production exposure, provider behavior, or native-client readiness claims.

The proposed separation is consistent with ADR-0010: mutually exclusive credential transports, server-derived identity, owner-scoped session management, and no fallback. The mobile branch should require a real resolved principal and a fresh, trusted access-token verification against the same token after principal resolution, with issuer/audience/version/subject/session/timing claims checked and tied to the principal. A synchronous fresh read of the complete owned mobile current-session row followed immediately by the repository's atomic owner/current/target recheck and revocation is a sound boundary for closing await-time expiry/revocation races. Ensure the shared revocation primitive retains its bounded refresh-history and active-session checks; do not introduce a separate direct database mutation.

Mandatory implementation conditions:

- Enforce the plan's strict direct-TLS request parsing and mobile-only Bearer branch. Reject cookies and browser credentials, Origin, CSRF/idempotency aliases, query/body input, malformed or ambiguous headers, and forwarded-protocol trust. Only absent or single zero Content-Length is accepted; no transfer encoding.
- Preserve generic unknown/foreign-target behavior, no-store problem responses, empty 204 success, and no Set-Cookie. Do not expose target ownership or data.
- Do not add CSRF calls, cookie cleanup, idempotency semantics, native claims, production registration, or source edits outside the four proposed new files. Retain the accepted DELETE contract's defined status behavior.
- Keep the accepted ST195 hard gate and independent implementation/review/CI gates intact. Tests must exercise real token/principal/repository seams and raw HTTPS/parser behavior, including expiry and revocation races.

These conditions are required for the plan's stated Type 2a approval; a change to production registration, deployment exposure, or security model requires reclassification and escalation.
