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

### Default runtime availability exception (ADR-0018 / SEC-FU1f)

The default API graph and its configured v2 nonce/OTP graph do not register the six legacy operations below; they return route-not-found (404). Their OpenAPI paths and wire schemas remain preserved with `x-runtime-availability: unavailable-default`. The privacy, export and deletion feature requirements remain required. This narrowly supersedes ADR-0010's default availability preservation for these operations only. No caller header, Bearer credential, body or legacy enable flag activates them.

OpenAPI metadata version is 1.1.1 (previously 1.1.0); URLs, schemas and credential versions remain unchanged. Default runtime availability is intentionally withdrawn; this does not certify backward runtime compatibility or rollout safety.

- GET `/v1/privacy/settings`
- PATCH `/v1/privacy/open-book`
- GET `/v1/privacy/preview-as/{householdId}`
- POST `/v1/data-rights/export`
- GET `/v1/data-rights/export/{token}`
- DELETE `/v1/data-rights/account`

Future activation requires independently reviewed authenticated principal binding, owner/household data scope, export/download semantics and account deletion proof/lifecycle integration. Current internal tests and containment do not authorize production activation, deployment or a security all-clear. Operational endpoints and the accepted opt-in v2 graph retain their existing behavior.

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
PATCH  /v1/subscriptions/:id                           {status}  # contract-only ST-215 lifecycle slice
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

The ST-215 PATCH contract is a **partial status-only slice**, with no enabled mutation route yet. It accepts an owner-only V1 current-session Bearer request with a UUID `:id`, no query parameters, and a JSON object containing exactly one `status` field: `ACTIVE`, `PAUSED`, `CANCELLED`, or `ARCHIVED`. The locked current status and requested target must form one of seven pairs: `ACTIVE→PAUSED/CANCELLED/ARCHIVED`, `PAUSED→ACTIVE/CANCELLED/ARCHIVED`, or `CANCELLED→ARCHIVED`. The private writer decides from locked state. Success returns only `{id,status}`. A repeated request after success can return 409; after an uncertain response, re-read authoritative state. No replay or exactly-once guarantee is offered.

Unknown or mixed fields, including `name`, `category`, `cadence`, `alwaysPrivate`, and `catalogPlanId`, receive 400 in this slice. Those manual edits remain a **future broader PATCH roadmap** and are not yet contracted or implemented. Review, feedback, undo, sharing, automatic cancellation, and the rest of ST-081/UF-06 remain separate. Errors are RFC 9457 `application/problem+json`: invalid path/body/target/query 400, invalid current principal 401, identical missing/owner-invisible 404 `SUBSCRIPTION_NOT_FOUND`, disallowed or stale transition 409 `LIFECYCLE_CONFLICT`, and masked storage fault 500. See ADR-0023 for the contract decision and route readiness gates.

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

## Private development web enrollment (ST-229, contract only)

These three additive operations are disabled/unavailable by default and limited
to explicitly opted-in private development HTTPS web. No runtime, storage,
provider, delivery, UI or account-readiness acceptance follows from this contract.
Existing login and anonymous mobile enrollment OTP operations remain unchanged.

1. Bootstrap `enroll_identifier` browser nonce, then use existing strict OTP
   start/verify. Both successes rotate the enrollment nonce on the same exact
   Origin/browser chain/HttpOnly binding cookie. The proof remains restricted
   `enrollment/enroll-credential`; it never becomes a login proof.
2. `POST /v2/auth/enrollment/pending` accepts exactly
   `{transport:'web',identifierProof}`. `201` returns exactly
   `{transport:'web',continuation,status:'pending',nextBrowserNonce}`. Consume
   proof, admit pending state, rotate enrollment nonce and settle atomically.
3. `POST /v2/auth/enrollment/simulator/verify` accepts exactly
   `{transport:'web',continuation}`. Mandatory trusted server simulator
   verification happens outside account locks. `200` returns exactly
   `{transport:'web',verifiedEnrollment,status:'verified',nextBrowserNonce}`.
   Revalidate after awaits, consume pending, store separate authoritative
   subject-HMAC/verified-at/trusted-name record and atomically transition to
   session-purpose nonce on the SAME Origin/chain/binding cookie; bind the
   authoritative record to that nonce digest. No client provider result/subject,
   identity, contact, challenge, name or role selector is accepted.
4. `POST /v2/auth/enrollment/complete` accepts exactly
   `{transport:'web',verifiedEnrollment}`. A single connection/transaction
   rechecks locked reservation/authority/nonce, uses existing insert-only
   provisioner then ordinary server-derived owner RequestContext, and commits
   account/private fields/contact/defaults/session/family/CSRF, terminal nonce
   and authority consumption and completed settlement together. `201` is exactly
   `WebSessionResponse {transport:'web',sessionId,csrfToken}`, no successor nonce.

Require exactly one `Idempotency-Key` matching `^[\x21-\x7e]{16,255}$` (spaces
excluded), configured exact HTTPS `Origin`, 43-base64url `X-Browser-Nonce` and
deployment binding cookie. Reject all query parameters, duplicate/framing
ambiguity, Authorization, access/refresh cookies, CSRF and legacy authority
headers. Browser controls Origin/cookies; wire envelopes model server-observed
evidence, never JavaScript access to HttpOnly cookies. Generated SDK calls alone
cannot enforce these transport checks. Proof is `v2.` +43 base64url; pending and
authoritative handles use distinct `wep.` and `wev.` domains +43 base64url.

Burn global key independently before mutation/provider work, bind operation,
web, trusted chain and keyed strict request digest, retain at most24h. Every
pending/completed/failed duplicate gives generic `409 AUTH_RESTART_REQUIRED`
without replay. Pending and authoritative stores are each bounded to10000 and
at most five minutes; pending cannot outlive proof/contact metadata, authority
cannot outlive pending. Never renew/revive; session nonce exact five-minute TTL
does not extend tighter authority expiry. Expired/consumed/mismatched/conflicting
state fails closed. Rollback preserves burn; crash pending expires. Uncertain
commit/lost response requires fresh verified login/nonce, no automatic retry,
response replay or destructive compensation; unknown orphan sessions expire.

Only verified active registered subject on completion gives
`409 ENROLLMENT_LOGIN_REQUIRED`, followed by explicit later verified login;
never return an enrollment session, relink contact or overwrite profile. Deleted
subject, contact conflict and insertion-race loser give generic restart. Every
outcome has `Cache-Control: no-store` and `Pragma: no-cache`. Problems have exactly
`{type:'about:blank',title:'Authentication unavailable',status,code}`: 400 malformed,
401 invalid proof/provider authority, 403 Origin/binding policy, 404 disabled,
409 restart/login-required, 429 capacity/throttle, 500 unavailable dependencies.
No detail/instance/PII/provider/driver information or credential cookies on errors.
After commit only, set host-only Secure/HttpOnly/SameSite=Lax `st_v2_access`
Path=/v2 and `st_v2_refresh` Path=/v2/auth, omit Domain and preserve binding cookie.
Access15min/session24h unchanged; CSRF/proof/handles in memory, credentials never
in body, URL, local storage or logs.

Future prerequisites are explicit: coherent private normalized contact issuance
metadata and secret-bound restricted-proof resolution (current OTP has hashes;
proof consumption returns boolean), transaction-bound consumption, authoritative
enrollment producer (current simulator resolves registered login only), trusted
given/surname extension (never split full name), same-chain cross-purpose nonce
transition (current rotate preserves purpose), new idempotency operation entries
and async reserve/settle ports. Profile/Just me, household/native/real BankID and
exact auth-state SQL objects/grants/operations remain separately reviewed.
Current-versus-predecessor CSRF consumed-refresh policy needs its own security
gate; this task neither chooses it nor adds a recovery operation. Without reviewed
CSRF recovery, reload requires fresh verified login. Existing access-readiness
sketch authorizes no permissions.

## Session management and deletion (existing operations)

Session listing and revocation are scoped to the active authenticated caller; no identity selector is accepted. Derive `{identityId, sessionId}` only from an active server-validated v2 credential. Unknown, expired, or revoked credentials reveal no ownership. Missing/invalid auth uses a stable generic RFC 9457 `401`; CSRF failure is `403`; use `application/problem+json` and redact credentials and PII from errors and logs.

Development delete-OTP start resolves the caller's registered identifier from server-side session context and accepts no identifier, identity, method, or environment selector. Start and verify both require explicit development mode plus `AUTH_DELETE_OTP_DEV_ONLY=true`, failing closed elsewhere. Verify is bound to the same principal and session, consumes the caller-owned challenge atomically, and issues a deletion-only proof that can never log in. Production deletion requires recent BankID reauthentication. `DELETE /v2/me` always requires the current active same-principal session and, for web, exact Origin plus session CSRF; it separately consumes the matching account-delete proof atomically. Proof alone is never sufficient.

## Idempotency and scope

Every mutating POST requires `Idempotency-Key`, bound to operation, transport and request hash. It also binds a browser chain or verified principal, with one narrow anonymous exception: mobile `startV2Otp` and `verifyV2Otp` for `enroll_identifier` use a separate server-derived anonymous request digest and bind that explicit purpose. This digest isolates a request; it establishes no principal or account authority. Mobile `otp_step_up` has no anonymous runtime authority under this exception. A duplicate pending or committed operation returns a generic RFC 9457 `409` with code `AUTH_RESTART_REQUIRED`; it never acknowledges another caller's operation or returns a code, token, or proof. It cannot bypass throttles or one-use consumption. If a one-use operation committed but its response was lost, restart: bootstrap a fresh unique browser nonce chain (invalidating the previous chain), or obtain a fresh OTP challenge and verify again under existing throttles. Session creation requires a fresh server-verified login proof; ST170b remains a prerequisite. After successful login, use the owner-scoped session list and revocation flow for a known prior public `sessionId`; unknown orphan sessions expire normally. For uncertain refresh, never retry the old refresh credential because reuse revokes its family. Discard local credentials and complete a fresh verified login, then use owner-scoped session management for a known prior session. No client supplied identity or old-session selector is added. DELETE operations remain authenticated and replay-safe through owner scope and atomic proof consumption.

This candidate does not implement or certify these controls. Before implementation or rollout, complete security/privacy review of nonce, CSRF, proof binding, storage and rotation; inventory databases before schema work; confirm exact production origins, cookie host, trusted proxy hops, production keys and the development-only delete gate. Verify RLS only on disposable PostgreSQL with a qualified non-superuser, non-`BYPASSRLS` role. Do not claim deployment compatibility or rollout safety before inventory.
