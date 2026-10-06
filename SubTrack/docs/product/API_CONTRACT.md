# API Contract (v1)

- **OpenAPI 3.1 first.** The spec lives at `packages/contracts/openapi.yaml`.
  - A TypeScript client and zod schemas are generated from it for web and mobile.
  - Handlers must conform; a CI contract test checks this.
- **Changing an endpoint** requires an ADR if it is breaking, and a contract version bump.
- **Auth:** a short-lived access JWT (15 min) plus a rotating refresh token (30 days), sent as an httpOnly cookie on web and kept in SecureStore on mobile.
- **Errors:** RFC 9457 `application/problem+json`, with a stable `code` (e.g. `HOUSEHOLD_ADMIN_REQUIRED`).
- **Pagination:** cursor-based (`?cursor=&limit=`). **Idempotency:** mutating POSTs accept an `Idempotency-Key`.
- **Scope parameter** on read endpoints: `scope=me|household|member:<memberId>`. The server enforces the visibility policy regardless of what the client asks for.

## Endpoints
```
# Auth & identity
POST   /v1/auth/otp/start            {channel, identifier}
POST   /v1/auth/otp/verify           {challengeId, code} -> {registrationToken | session}
POST   /v1/auth/bankid/start         {intent: register|login|reauth} -> {orderRef, autoStartToken, qrSeed}
GET    /v1/auth/bankid/:orderRef/qr  -> animated QR payload (for web polling)
POST   /v1/auth/bankid/:orderRef/collect -> {status, hintCode, session?}
POST   /v1/auth/bankid/:orderRef/cancel
POST   /v1/auth/simulator/complete   {orderRef, demoIdentityId}   # only when BANKID_MODE=simulator
POST   /v1/auth/refresh | /v1/auth/logout
GET    /v1/me | PATCH /v1/me
GET    /v1/me/sessions | DELETE /v1/me/sessions/:id
POST   /v1/me/export  | GET /v1/me/export/:jobId
DELETE /v1/me                        (requires recent BankID reauth)

# Households
POST   /v1/households
GET    /v1/households/:id
PATCH  /v1/households/:id                           (admin)
DELETE /v1/households/:id                           (admin, BankID reauth)
GET    /v1/households/:id/members
POST   /v1/households/:id/dependants                (admin)
DELETE /v1/households/:id/members/:memberId         (admin, or self = leave)
POST   /v1/households/:id/admin-transfer            (admin) {toMemberId}
POST   /v1/households/:id/invitations               (admin) {channel, target?}
GET    /v1/households/:id/invitations
DELETE /v1/households/:id/invitations/:invId        (admin)
GET    /v1/invitations/:token                       (public preview: household name, admin first name)
POST   /v1/invitations/:token/accept                (authenticated + BankID verified)
POST   /v1/invitations/:token/decline
PATCH  /v1/households/:id/members/me/privacy        {openBook}

# Banking
GET    /v1/providers                                  -> available providers & institutions
POST   /v1/bank-connections                           {provider, institutionId} -> {redirectUrl | syntheticPersona}
GET    /v1/bank-connections/callback                  (provider redirect)
GET    /v1/bank-connections | DELETE /v1/bank-connections/:id?purge=true
POST   /v1/bank-connections/:id/sync                  -> {jobId}
GET    /v1/sync-jobs/:jobId
GET    /v1/accounts
GET    /v1/transactions?accountId&from&to&cursor       (owner only, always)

# Subscriptions
GET    /v1/subscriptions?scope&status&category
GET    /v1/subscriptions/:id
POST   /v1/subscriptions                               (manual)
PATCH  /v1/subscriptions/:id                           {name, category, cadence, status, alwaysPrivate, catalogPlanId}
POST   /v1/subscriptions/:id/review                    {action: confirm|reject|merge, mergeWith?}
GET    /v1/subscriptions/:id/charges
GET    /v1/subscriptions/:id/price-history
GET    /v1/subscriptions/:id/alternatives
POST   /v1/subscriptions/:id/share                     {householdId}
DELETE /v1/subscriptions/:id/share
PUT    /v1/subscriptions/:id/split                     {ruleType, allocations[]}
GET    /v1/review-inbox

# Money
GET    /v1/households/:id/settlements?period=YYYY-MM
POST   /v1/households/:id/settlements/:period/compute
POST   /v1/households/:id/settlements/:period/settle   {note?}

# Dashboard & insights
GET    /v1/dashboard?scope
GET    /v1/insights?scope&kind
POST   /v1/insights/:id/dismiss
GET    /v1/forecast?scope
POST   /v1/ask                                          {question, scope} -> {answer, citations[]}

# Catalogue
GET    /v1/catalog/merchants?q
GET    /v1/catalog/categories

# Ops
GET    /healthz | /readyz | /v1/version
```

## Internal service contract (API → ML service; network-internal only)
```
POST /ml/v1/forecast       {series:[{month, amount_minor}], horizon:12} -> {points:[{month,p10,p50,p90}], model_version}
POST /ml/v1/classify       {items:[{description, amount_minor, mcc?}]} -> {items:[{category_code, is_subscription_prob, top_k}]}
POST /ml/v1/cluster/subscriptions {vectors...} -> {labels, persona_names}
POST /ml/v1/anomalies      {charges:[...]} -> {flags:[...]}
GET  /ml/v1/models
```

# API contract addendum: authentication v2

**Status: accepted contract-only (ADR-0010).** This addendum accompanies `openapi.yaml` and describes accepted wire-level requirements only. Existing `/v1` routes and semantics remain unchanged. No provider protocol, runtime implementation, schema migration, deployment, or rollout is authorized or claimed.

## Transport and browser binding

The client chooses `web` or `mobile` at proof/session creation; the server binds the proof to that choice. Web requests require an exact configured `Origin` match. Reject `Origin: null`, wildcard and reflected credentialed CORS. The browser nonce endpoint issues a public, one-use nonce in JSON and a separate host-only `Secure; HttpOnly; SameSite=Lax` binding cookie with `Domain` omitted. The client returns the public nonce in `X-Browser-Nonce`; it never reads the cookie. Purpose, exact origin, cookie pair, challenge/proof chain, expiry and one-use redemption are bound together. When a transition rotates the browser nonce, its response returns `nextBrowserNonce`.

Authenticated unsafe web cookie calls require `X-Session-CSRF`, a readable token bound to the authenticated session and distinct from the pre-auth nonce. Session creation and refresh return it; lifecycle rotation updates it. Exact Origin is required for web unsafe requests. Mobile Bearer requests do not use cookie CSRF. Production requires HTTPS, HSTS, configured proxy trust and fail-closed cookie host/origin/key configuration. Cookie names/paths are `st_v2_access` at `/v2` and `st_v2_refresh` at `/v2/auth`; both are host-only, Secure, HttpOnly, SameSite=Lax. Narrow paths preclude the `__Host-` prefix.

## Proof and session rules

Proofs expire after five minutes. Browser nonce bootstrap uses `Cache-Control: no-store` and `Pragma: no-cache`; browsers provide `Origin` automatically and JavaScript must not set the forbidden header. The generated web/mobile wire-call envelopes model required headers and body transport together for future adapters; low-level generated SDK calls do not enforce the envelope by themselves.

OTP start accepts only channel, identifier, purpose and transport. Normalize identifiers, throttle by IP and identifier, and keep response body/status/timing non-enumerating; `202` makes no delivery or account-existence claim. OTP alone never selects/creates a principal or establishes login. Enrollment order remains identifier, OTP verification, mandatory verified BankID. Enrollment proof permits only the BankID continuation. Step-up proof is not a login proof. Login proof must be server-produced after verified BankID or a server-verified registered mobile passkey/biometric assertion plus OTP; this producer integration is separately gated by ST170b. No client-asserted BankID results or invented provider fields are accepted.

Store only hashes of opaque proof and refresh credentials. Proofs bind purpose, established identity where applicable, normalized identifier hash where relevant, initiating challenge, transport, action and browser chain; use short expiry and atomic one-use redemption. Access and refresh lifetimes are 15 minutes and 30 days. Refresh consumes one active hash atomically and creates one same-identity, same-family successor. Concurrent losers create no successor; reuse of a consumed credential revokes the family. Keep consumed hashes for the applicable refresh lifetime.

Web session responses set access/refresh cookies and return `{sessionId, csrfToken}`. Mobile receives `{accessToken, refreshToken, sessionId}` once for OS secure storage. Web refresh uses only its refresh cookie, exact Origin and session CSRF; mobile refresh uses only `Authorization: Refresh <opaque-secret>`, never body/query. Refresh has no request body, responses are `no-store` and `Pragma: no-cache`, and mixed cookie/Authorization credentials are rejected. Protected mobile requests use `Authorization: Bearer <access JWT>`. Reject cookie-plus-Bearer, refresh mixed credentials and all credential-mode fallback. Keep v2 issuer/audience/key space separate; never accept v2 credentials in v1 or use v1 identity headers as fallback.

## Session management and deletion

Session listing and revocation are scoped to the active authenticated caller; no identity selector is accepted. Derive `{identityId, sessionId}` only from an active server-validated v2 credential. Unknown, expired, or revoked credentials reveal no ownership. Missing/invalid auth uses a stable generic RFC 9457 `401`; CSRF failure is `403`; use `application/problem+json` and redact credentials and PII from errors and logs.

Development delete-OTP start resolves the caller's registered identifier from server-side session context and accepts no identifier, identity, method, or environment selector. Start and verify both require explicit development mode plus `AUTH_DELETE_OTP_DEV_ONLY=true`, failing closed elsewhere. Verify is bound to the same principal and session, consumes the caller-owned challenge atomically, and issues a deletion-only proof that can never log in. Production deletion requires recent BankID reauthentication. `DELETE /v2/me` always requires the current active same-principal session and, for web, exact Origin plus session CSRF; it separately consumes the matching account-delete proof atomically. Proof alone is never sufficient.

## Idempotency and scope

Every mutating POST requires `Idempotency-Key`, bound to operation, transport, browser chain or verified principal, and request hash. A duplicate pending or committed operation returns a generic RFC 9457 `409` with code `AUTH_RESTART_REQUIRED`; it never acknowledges another caller's operation or returns a code, token, or proof. It cannot bypass throttles or one-use consumption. If a one-use operation committed but its response was lost, restart: bootstrap a fresh unique browser nonce chain (invalidating the previous chain), or obtain a fresh OTP challenge and verify again under existing throttles. Session creation requires a fresh server-verified login proof; ST170b remains a prerequisite. After successful login, use the owner-scoped session list and revocation flow for a known prior public `sessionId`; unknown orphan sessions expire normally. For uncertain refresh, never retry the old refresh credential because reuse revokes its family. Discard local credentials and complete a fresh verified login, then use owner-scoped session management for a known prior session. No client supplied identity or old-session selector is added. DELETE operations remain authenticated and replay-safe through owner scope and atomic proof consumption.

This candidate does not implement or certify these controls. Before implementation or rollout, complete security/privacy review of nonce, CSRF, proof binding, storage and rotation; inventory databases before schema work; confirm exact production origins, cookie host, trusted proxy hops, production keys and the development-only delete gate. Verify RLS only on disposable PostgreSQL with a qualified non-superuser, non-`BYPASSRLS` role. Do not claim deployment compatibility or rollout safety before inventory.
