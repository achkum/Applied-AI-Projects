# Proposed next contract task (12 lines)
1. Title: V2 browser owner-detail read POST contract; size M; owner architect-platform/contract author.
2. Reviewers: architect-client, security-privacy, qa-engineer; independent readiness first, then exact-source review.
3. Depends on accepted ST-218 ADR/readiness, ADR-0010 and accepted V1 subscription detail projection/contract; no runtime task bundled.
4. Allowed paths: `packages/contracts/openapi.yaml`, `packages/contracts/generated/**`, `packages/contracts/tests/**`, reserved task/evidence files.
5. Add only `POST /v2/subscriptions/{id}/read`: strict UUID, exactly empty JSON `{}`, no query or caller identity selector.
6. Require direct HTTPS, exactly one v2 access + binding cookie, exact allowlisted Origin and session-bound `X-Session-CSRF`; reject refresh/Bearer/mixed or duplicate credentials.
7. Response reuses owner detail, no-store and strict 400, 401, CSRF 403, identical foreign/missing 404 and masked 500 problems.
8. Mark `x-runtime-availability: unavailable-default`; no runtime registration, issuer, token translation or public endpoint.
9. Contract tests prove body/query strictness, security envelope, generated SDK/Zod parity and unchanged V1 routes.
10. ADR-0010 idempotency is for mutating POST; this read has no nonce/session/CSRF/subscription mutation and no Idempotency-Key.
11. Later L runtime task verifies access `sid/sub`, calls `webContextForCurrentSession(sid,{userId:sub},bindingCookieHash,origin,now)`, `DevelopmentV2PrincipalResolver.resolve` and `SessionCsrfGuard.verify`; then proves HTTPS browser + owned PG.
12. ST-217 stays NOT_READY until accepted account/session onboarding, usable runtime, independent reviews, QA browser+PG proof and applicable CI.
