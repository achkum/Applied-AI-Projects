# ST-185 security source review

**Decision: APPROVE**

Reviewed the exact ST-185 refresher implementation and its adjacent specification against the ST-185 contract, repository Constitution, and the prior ST-185 platform and security plan reviews. This approves the reviewed source snapshot only, subject to the ST-185 source gate and the existing limits on this internal development service.

## Findings

The implementation keeps caller identity, session, and family selectors out of the request. It accepts only exact own enumerable data properties, snapshots transport context before collaborator calls, preserves receivers for captured repository and issuer methods, and rejects accessors, hidden/symbol/extra fields, noncanonical refresh secrets, invalid clock readings, invalid randomness, and hash collisions before rotation. Refresh secrets use the required canonical 32-byte base64url representation and the shared domain-separated SHA-256 prefix; only hashes are passed to the repository.

The service performs one rotation call with a frozen hash-only input. Synchronous outcomes are inspected before any await; asynchronous outcomes are accepted only from a native Promise with the expected prototype and no own properties. Rotated outcomes require exact data shape, canonical IDs, and bounded expiry. Invalid/reused, unknown, malformed, or throwing outcomes yield the generic failure without credentials or unsafe cleanup.

After a validated rotation, the implementation records cleanup solely from stored outcome fields and the generated successor hash, uses a frozen owner context, checks monotonic safe clock values after rotation and signing, issues one access token for the stored owner/session, and returns only a frozen minimal response. Post-commit failures attempt exact-family cleanup and never restore or retry the consumed token. Cleanup failures remain credential-free. The bounded unknown-orphan behavior is consistent with the reviewed contract.

The adjacent specification covers canonical grammar and hostile input shapes, method receiver capture, dependency call ordering, wrong transport binding, issuer/refresher/resolver shared-state behavior for mobile, web, and IPv6 origins, replay invalidation with neighboring family/identity preservation, concurrency, post-commit cleanup, deferred clock faults, malformed adapter outcomes, and bounded unknown orphans. These are source/spec review observations; this review did not execute QA.

## Limits

Approval is limited to the exact hashed files below and the internal development path. It does not approve HTTP integration, cookies, CSRF, idempotency, provider or durable storage adapters, production authentication, or client readiness. The implementation remains subject to the formal ST-184 acceptance gate and the task's independent review and QA process.

## Reviewed files

- `/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-refresher.ts`: `c63b26b89e5028db6fba079b2be9b0af99bb079f51500e0f91636b281de0bda4`
- `/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-session-refresher.spec.ts`: `b6d819cad6cbf1cef19ea94e39c298aa49bff2a314bee316ed490c61956de8f7`

## Review accounting

Actual tool calls: **3**. Call 1 read the requested repository instructions, Constitution, ST-185 task, prior platform/security reviews, implementation, and specification. Call 2 read the full refresher implementation after the combined output was truncated. Call 3 wrote this review artifact and calculated both SHA-256 values. No source, test, QA, or Git state was changed.
