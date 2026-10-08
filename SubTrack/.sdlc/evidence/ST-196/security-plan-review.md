# ST196 security plan review

**Decision: APPROVE — Type 2a architecture, with mandatory implementation conditions.** The accepted DELETE contract, transport/authentication boundary, and reusable session repository behavior make this a reversible cross-module HTTP architecture decision. This approves the development-only plan; it does not approve production release or native-client readiness.

Compatibility is confirmed against `.sdlc/tasks/ST-170c.md`, `v2-session-issuer.ts`, and OpenAPI lines 471–495. The task records owner-scoped session revocation and mobile bearer transport as accepted reference behavior. The repository exposes synchronous `readSession(sessionId, { userId }, now)` returning a full immutable session record or null, and `revokeForCurrentSession(requestSessionId, targetSessionId, { userId }, observedAt)`; its synchronous commit rechecks active owned caller and target, retains a bounded refresh tombstone, and returns `revoked | invalid | missing | capacity`. `SessionRecord` carries transport and exact mobile/web binding fields. OpenAPI already defines DELETE, bearer and web security branches, no cookie CSRF for bearer mobile, mixed-credential rejection, opaque unknown/foreign IDs, and 204 success.

The proposal’s strict bearer-only direct-TLS boundary is sound if implemented as written: authenticate a genuine mobile principal; validate the same JWT against fresh time before and after async resolution; match token subject/session to that principal; reread and require its current live mobile row; then atomically revoke the owned target. Do not use a stale-principal fallback, invoke CSRF, or clear cookies. A committed revocation with a lost response is an ambiguous outcome; do not restore it or promise retry safety.

**Mandatory conditions:**

- Keep explicit opt-in development-only registration, outside default providers, startup, production configuration, and client behavior.
- Preserve the raw-request restrictions and generic non-cacheable error mapping in the proposal; do not trust forwarded protocol headers or parse body/query data.
- Require the post-await current row to be complete, live, and mobile. Keep the atomic repository call adjacent with no await gap; never fall back to principal snapshot data.
- The proposed test file `apps/api/test/v2-mobile-revocation-http.spec.ts` is outside ST-170c’s current `allowed_paths` (`apps/api/src/auth/**` and the task file). Update the task contract’s allowed paths before implementing that file.
- Preserve the accepted OpenAPI contract. Make no sibling-CSRF-cleanup, retry-guarantee, production-readiness, or Android/iOS verification claim.

No implementation or tests were reviewed.
