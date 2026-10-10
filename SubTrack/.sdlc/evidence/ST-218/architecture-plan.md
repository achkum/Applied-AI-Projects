# ST-218 Type 2a architecture plan (20 lines)
1. Decision class Type 2a: additive v2 API and development-only composition; no accepted seed ADR or security model is replaced.
2. Keep `/v1/subscriptions*`, V1AccessBearer and its existing guard unchanged and unavailable by default.
3. Add opt-in `POST /v2/subscriptions/{id}/read` for detail and later status-only `PATCH /v2/subscriptions/{id}` with existing response, error and seven-pair semantics.
4. Contract the read POST first: exactly `{}` body, no query, `unavailable-default`; it is pure read, so ADR-0010's mutating-POST idempotency rule does not apply.
5. On direct HTTPS require exactly one `st_v2_access` and distinct binding cookie; reject `Authorization`, refresh cookie, duplicates and caller identity selectors.
6. Verify access to derive `sid/sub`, call `webContextForCurrentSession(sid,{userId:sub},bindingCookieHash,origin,now)`, then `DevelopmentV2PrincipalResolver.resolve(access,{transport:'web',exactOrigin,browserChainId})`; compare resolver owner/session with verified sub/sid; its checked chain came from webContext; then scope subscription.
7. Require exact allowlisted Origin and `SessionCsrfGuard.verify({identityId,sessionId},X-Session-CSRF)` on POST read and PATCH; the read never mutates nonce, session or CSRF state.
8. Attach only the verified v2 principal's `identityId` to `RequestContext.userId`; never use a client owner, household or scope header.
9. Reuse subscription read projection and locked status writer under ordinary-role, transaction-local PostgreSQL RLS.
10. Preserve strict 400, unauthenticated 401, CSRF 403, identical foreign/missing 404, masked 500, no-store and uncertain PATCH reread.
11. Development factory takes explicit verified auth ports and owned fixture Prisma; no ambient database or default AppModule wiring.
12. The initial session reader may be the accepted in-memory development reference; authorize no persistent or production session from this slice.
13. Seed only a synthetic registered identity and owned subscriptions in a newly labelled disposable PG16 fixture; pass that identity to the development session store.
14. Issue a simulator login proof server-side in the fixture, then have an actual HTTPS browser redeem via nonce/session HTTP and call v2 read POST/PATCH with cookies/CSRF.
15. Prove foreign, revoked, expired, wrong-origin, duplicate/mixed credential, missing-CSRF, rollback, concurrency and pooled-RLS isolation; browser read POST must carry Origin naturally.
16. Browser and owned-PG evidence proves transport and owner binding only; it does not establish enrollment, real BankID or durable user access.
17. Keep the v2 route unavailable to ST-217 UI until accepted account/session onboarding and independently reviewed runtime activation exist.
18. Obtain independent architect-client and security-privacy readiness before implementation, then source reviews and QA actual-browser/PG proof.
19. No token export, v2-to-v1 translation, caller-selected identity, public listener, provider/account creation or persistent database operation.
20. If review determines a v1/v2 bridge, new credential authority or seed ADR replacement is necessary, classify Type 1 and stop dependent implementation for a concrete founder decision.
