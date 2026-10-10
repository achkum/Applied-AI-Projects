# ST-217 client interaction and binding plan

This is a source-pinned plan only. ST-058c's approved Spotify route is a static `ReceiptCard` mock (`apps/web/app/[locale]/subscriptions/[id]/page.tsx`, `subscription-detail.tsx`); it does not load an API record or expose lifecycle controls. Contract source: `packages/contracts/openapi.yaml` GET `/v1/subscriptions/{id}`, `VisibleSubscription`, status-only PATCH and `SubscriptionLifecycleResult`/`SubscriptionLifecycleError`; generated bindings are in `packages/contracts/generated/{sdk,types,zod}.gen.ts`. Read service projection is in `apps/api/src/subscriptions/subscription-read.service.ts`; the read controller is explicitly test-only and absent from `AppModule`. ADR-0023 and ST-215 readiness/evidence define the seven-pair transition authority.

## Interaction plan (16 lines)
1. Keep the approved detail frame; remove Spotify fixture name, amount, price-history points and any derived savings from the live API-bound view.
2. Fetch detail by route UUID through generated GET `/v1/subscriptions/{id}`; no list lookup or caller-supplied identity/scope.
3. Validate the generated projection; format `expectedAmountMinor` by `BigInt(canonicalString)` and `packages/money` formatter, never `Number` or float conversion.
4. `visibility=owner` gates presentation only; the server independently binds principal, enforces owner scope/RLS and validates the locked transition. Use localized unnamed fallback if both optional names are absent.
5. Offer targets only from the current status: ACTIVE→PAUSED/CANCELLED/ARCHIVED; PAUSED→ACTIVE/CANCELLED/ARCHIVED; CANCELLED→ARCHIVED.
6. DETECTED, TRIAL, REJECTED and ARCHIVED expose no lifecycle action; same-status targets are never offered.
7. On initial load show localized loading state; on GET failure show a fixed localized retry state without resource detail.
8. On mutation, disable all action controls and announce localized pending state; do not optimistically change status.
9. Send only `{status: target}` to PATCH with UUID path; never send owner, action, scope or edit fields.
10. Accept success only as bounded `{id,status}` matching the requested subscription and target.
11. Map 400 INVALID_SUBSCRIPTION_LIFECYCLE_REQUEST, 401 AUTHENTICATION_REQUIRED, 404 SUBSCRIPTION_NOT_FOUND, 409 LIFECYCLE_CONFLICT and 500 INTERNAL_ERROR to fixed bilingual messages.
12. On PATCH 401 or 404 immediately clear stale private detail and all controls; require a fresh authenticated successful GET before restoring any view or action.
13. On 409 or uncertain PATCH outcome, re-read; only a successful authenticated GET may replace detail and recompute actions.
14. If that re-read fails (network, 401, 404 or 500), keep private detail unavailable and every control disabled with fixed retry copy; never use stale projection or auto-retry PATCH.
15. Do not log or persist credentials, identifiers, response bodies or errors; do not place them in URLs beyond the contract UUID route.
16. Add sv/en labels, pending, unavailable, conflict, retry and action-result copy through existing catalogues; preserve tokens, focus, accessible names and approved layout.

## Readiness and handoff
Contract/runtime prerequisites are separate: ADR-0023 explicitly leaves PATCH unavailable by default pending accepted ST-081c writer, verified current principal, ordinary-role PostgreSQL RLS/rollback/concurrency proof and independent security review. GET is likewise marked unavailable-default; the current API read controller is test-only. ST-216 remains IN_PROGRESS per task dispatch; no evidenced signed-in browser credential/session path exists here. ST-050b/c handoffs explicitly leave BankID, profile and household continuation pending; ST-050c proves enrollment OTP only and says no signed-in account/session. Therefore a later UI implementation is NOT_READY until platform/client/security owners provide a reviewed authenticated browser principal/session path and accepted usable GET/PATCH runtime evidence; a loopback test service is insufficient.

Suggested later implementation scope, after readiness: `apps/web/app/[locale]/subscriptions/[id]/page.tsx`, `subscription-detail.tsx` and its CSS; localized adapter under `apps/web/lib/`; tests under `apps/web/test/`; `packages/i18n/catalogs/{sv,en}.json`; and `packages/ui/src/components/ReceiptCard/` interface changes to accept canonical minor-unit strings and format through `packages/money` BigInt APIs. Do not render fixture price history or infer savings. Keep API contract/runtime, auth/session, persistence and credentials out of that client task. Requires architect-client/platform/security review, QA browser proof, applicable CI and the established task gates. This plan does not claim implementation, task completion, or parent ST-050/ST-081/UF-06 completion.



