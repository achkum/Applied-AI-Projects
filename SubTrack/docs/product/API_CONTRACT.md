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
