# ST200 independent security plan review

**Decision: APPROVE as Type 2a, with the conditions below.** This is a planning approval for the narrow internal resolver described in the proposal. It does not authorize an HTTP adapter, a change to the ST199 proof core, account deletion, provider delivery, production contact integration, or default/runtime wiring.

## Classification

The change remains within the accepted development-only deletion reauthentication model in ADR-0010 and the accepted ST199 core boundary. It supplies evidence for the already-required trusted authority assertion by resolving a real current v2 mobile principal and a server-owned registered contact. It adds no public contract and grants no new account capability. On that bounded interpretation this is Type 2a.

The classification depends on retaining the assertion-only design. A resolver that accepts an identity, session, contact, channel, or transport owner from its caller; authenticates by a brand alone; supports a web/v1 fallback; or changes proof semantics would introduce a security-model change and must be stopped and reclassified as Type 1 before implementation.

## Required implementation boundary

1. Keep the new resolver internal and mobile-only. It must accept only an access token and derive all identity and session values from verified isolated-v2 claims and the real `DevelopmentV2PrincipalResolver`. Require the exact mobile transport context. Do not use caller-provided owner selectors, decoded-unverified claims, v1 credentials, browser state, or a principal-minting shortcut.

2. Capture and bind only the required server-owned ports at construction, using descriptor-safe own-property snapshots and frozen config/return values consistent with the accepted v2 resolver patterns. Require the explicit development, enabled, and `AUTH_DELETE_OTP_DEV_ONLY=true` gates. Reject malformed config and input generically. No default provider/module wiring is in scope.

3. The contact reader is a narrowly scoped server port. Call it only with a freshly derived frozen `{ userId: actualPrincipal.identityId }` context and an observed time. It must return only an exact plain own-data object containing a lowercase 64-hex identifier hash and `email` or `sms`, or null. Reject raw identifiers, extra fields, accessors, symbols, malformed thenables, and any caller-controlled contact selector. The resolver must not log contact data. The implementation and tests must make clear that the port represents a server-owned registered contact; a test map is not evidence that a production contact source is safe.

4. Validate the verified claims, principal result, and full current owned mobile session row before contact lookup, so invalid/stale or non-mobile principals cannot trigger contact access. After every await, take a fresh clock reading, revalidate the same verified claims and expiry, and synchronously read and validate the full current owned mobile row again. Require monotonic valid time, matching identity/session, valid lifetime, and exact mobile transport. Only then construct and freeze the ST199 trusted assertion with the server-derived principal, contact hash/channel, and mobile transport.

5. Treat the final synchronous current-row read as the authority linearization point. The resolver proves current ownership at that read only; it cannot guarantee that the session remains current over future awaits. Any future unsafe HTTP consumer must freshly authenticate and recheck the current owned row immediately before starting or verifying a challenge, consuming proof, or performing another unsafe effect. It must also independently implement the accepted Idempotency-Key, transport, TLS, cookie, and throttle requirements. This resolver confers no exemption from those gates.

## Review and verification gates

The ST199 source gate is **pending**. The cited `c51ee027754bcdd944bd298b3573a37922680d7c` is ST197, not accepted ST199. ST199 PR 198 head `65d06b0332b13b9502c54842d1eac11db799bf24` has CI run `37767002077` still running and is not merged. Do not begin ST200 source work until the actual ST199 change is accepted on main and the accepted commit, unchanged source tree, completed all-green CI, and both independent ST199 plans are verified. If any part is missing, keep this source gate blocked.

The implementation must add focused tests for successful real fixed-simulator-login proof/access-token/principal/repository resolution; rejection before contact lookup for invalid, foreign, expired, revoked, deleted, web, or v1 credentials; and rejection when expiry, revocation, or deletion occurs during either await or before the post-await continuation. Exercise already-resolved promises as well as deferred promises. Also cover wrong-owner principal results, malformed claims/rows/contact results, getters and extra properties, hostile thenables, port/config mutation after construction, invalid or regressing clocks, and generic failure behavior. Use only a server-owned contact map with non-PII fixtures; do not involve delivery or provider behavior.

Keep ST200 to the two proposed new resolver/spec files and explicitly listed task/evidence metadata updates. Do not edit accepted auth sources or introduce HTTP, provider, database, deletion, or rollout code. Security review remains required after implementation, alongside the platform review and normal task gates. This approval expires if scope or semantics change; bring any such change back for a fresh classification.
