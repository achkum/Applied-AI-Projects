# ST-213 CI repair security/privacy review (2026-10-10)

Verdict: SOURCE_REPAIR_ACCEPTED_CONDITIONALLY; SECURITY_GATE_HOLD. This is a read-only review of the uncommitted repair snapshot based on PR #243 head `a46be12917e998aaa6c3dc0622b1ee24a185cc83`. It does not assert a new exact-head CI or actual PostgreSQL result.

Reviewed normalized Git blobs: composition `ef1de4b7ab0bc56d00fe539d91bb03972c277e1d`; controller `287375555927b914bb1b2606e3ac47054317bec3`; controller test `76b92e9acfa1e5d6421ede8f17515629fc8da81c`; HTTP/standalone integration `c4a0d129bc562c48965d1cfb9399546247e5b013`.

The isolated dynamic module registers its constructed `AuthenticatedPrincipalGuard(resolver)` as `APP_GUARD` using `useValue`. Removing controller `@UseGuards(AuthenticatedPrincipalGuard)` avoids a second Nest class-token resolution without the bound resolver. The controller is registered only in this isolated composition in current API source, and absent from default `AppModule`. Its handlers still obtain context only through `getVerifiedRequestContext`; missing or invalid bearer credentials fail before handler access. Composition coverage exercises missing/invalid token, accepted token, then session lookup rejection on a subsequent request. Existing resolver and session reader enforce current session ownership/revocation through scoped storage.

The integration cleanup repair moves throws out of `finally`, retains attempted child/container/private-directory cleanup, and records sanitized failure receipts. The final post-cleanup checks deny an incomplete proof and prevent a PASS receipt unless cleanup succeeded. No new credential or identifier logging was introduced by this repair.

The earlier CI result remains FAIL: standard lint rejected `no-unsafe-finally`, and the dedicated HTTP proof failed its owner/peer/share/open-book segment while standalone passed. This source review is not a security gate PASS. A new exact-head standard CI run and actual Linux/PostgreSQL dedicated HTTP plus standalone proof must pass; independent QA must then review those receipts. Any changes to the reviewed blobs require renewed source inspection.
