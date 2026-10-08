# ST195 Platform Plan Review

**Type 2a — APPROVE WITH MANDATORY CONDITIONS**

The proposal is a bounded, development-only adapter for the already accepted `GET /v2/me/sessions` mobile Bearer contract. It preserves the versioned credential boundary and introduces no production rollout, provider, database, dependency, account-lifecycle, or security-model change. The explicit mobile-only branch, TLS requirement, rejection of all cookies and identity selectors, trusted principal resolution, owner-scoped synchronous listing, and current-token expiry recheck align with ADR-0010 and the existing v2 ports.

**Mandatory conditions**

1. Do not implement until the ST194 hard gate is satisfied: accepted ST194 on `main`, with its required tree and CI evidence. Keep this prerequisite explicit in the task and review record.
2. Revalidate the same access token after principal resolution using the trusted token verifier and fresh trusted time; require unexpired claims to match the resolved identity and session. Reject if the resolver wait reaches token expiry.
3. Call `listForCurrentSession` synchronously after the fresh-time and claims checks, scoped to the resolved owner and session. Return only validated canonical summaries; malformed or failed repository output must fail closed.
4. Preserve the proposal's transport boundary: direct TLS only, exact mobile Bearer branch, reject any Cookie/Origin/CSRF/query/body input, and never fall back to v1 or browser-cookie authentication. Keep the module development-enabled only and out of the default application module.
5. Add the specified HTTP and repository-boundary tests, including sibling-session visibility, foreign-owner exclusion, deletion/expiry races, and malformed inputs and outputs. Report QA/security/CI evidence without claiming production readiness or clearing the deferred mobile device-verification gate.
