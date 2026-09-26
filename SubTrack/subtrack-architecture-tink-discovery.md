# SubTrack architecture and Tink discovery

**Status:** Architecture decision record for MVP1  
**Date:** 2026-09-26  
**Scope:** Sweden/EU, Tink Sandbox only, web-first MVP

## Executive decision

Proceed with a modular monolith: a Next.js TypeScript application, server-only domain/application services, PostgreSQL, and a separate background worker using the same domain packages. Put Tink behind a narrow `BankDataProvider` port and require the deterministic mock provider to support the entire product journey without Tink.

This stack is appropriate for the MVP because it keeps one deployable codebase and one transactional database while enforcing boundaries that can later be extracted. There is no application scaffold in the current workspace, so this is a design validation, not validation of existing implementation.

Tink is viable for the intended sandbox account/transaction ingestion flow in principle: Tink Link provides the user-facing bank authentication flow, and Tink documents European bank connectivity plus PSD2 and selected non-PSD2 account coverage. Exact product entitlements, scopes, Swedish demo institutions, redirect URIs, test users, history depth, refresh behavior, and webhook access are tenant-specific and could not be tested because no Tink credentials are present in this run. They are a release gate for the engineering-foundation milestone.

## Stack decision

| Layer | Choice | Constraint |
|---|---|---|
| Web | Next.js + React + TypeScript | Mobile-first; server components by default; client components only for interaction |
| API | Next.js route handlers calling application services | No business logic in routes; validate all input at the boundary |
| Domain | Framework-free TypeScript packages | No dependency on Tink DTOs, React, HTTP, or ORM |
| Persistence | PostgreSQL with an explicit migration tool/typed query layer | Money stored as integer minor units; timestamps UTC; identifiers UUID/ULID |
| Jobs | Separate worker process backed by a durable PostgreSQL job table initially | At-least-once execution; idempotency required; no in-request bulk sync |
| Authentication | Managed OIDC/email provider, server-side sessions | Do not build password or token storage; step-up for export/delete where available |
| Observability | Structured logs, error tracking, metrics, audit events | Never log tokens, raw Tink payloads, transaction descriptions, or personal identifiers |
| Tests | Unit + database integration + provider contract + Playwright E2E | Mock provider is the default CI provider; Tink sandbox smoke test is separately gated |

Avoid microservices, Kafka, event sourcing, GraphQL, a separate data warehouse, or an LLM in the transaction path for MVP1.

## System and domain boundaries

```text
Browser
  -> Web/API boundary
      -> Identity & user profile
      -> Bank connections / consent
          -> BankDataProvider port -> Tink adapter | deterministic mock adapter
      -> Ledger ingestion & normalization
      -> Recurrence detection and review
      -> Households and explicit sharing
      -> Split rules and settlement
      -> Privacy operations and audit
  -> PostgreSQL
  -> durable jobs -> worker -> provider adapter
```

Rules between boundaries:

- `Bank connections` owns provider users/connections, encrypted provider credentials, consent metadata, and sync cursors. No other module reads secrets directly.
- `Ledger` owns normalized accounts and transactions. Provider-native payloads are transient for transformation and diagnostics; do not persist them by default.
- `Detection` derives candidates and subscriptions from normalized ledger data. User corrections override later automated classifications.
- `Households` owns membership and invitations. Membership alone grants no access to accounts or transactions.
- `Sharing` creates a deliberate projection of a subscription into a household. It exposes only subscription-level fields selected by the owner, never source transactions.
- `Settlement` consumes shared subscription amounts and immutable split-rule versions. It uses integer arithmetic and deterministic remainder allocation.
- `Privacy` coordinates export, provider disconnect, and deletion across modules and records auditable outcomes without retaining deleted financial content.

## Provider contract

The application contract should express SubTrack needs, not mirror Tink endpoints.

```ts
type Money = { minor: bigint; currency: string };

interface BankDataProvider {
  createConnectionSession(input: {
    subjectId: string;
    market: "SE";
    redirectUri: string;
    state: string;
  }): Promise<{ url: string; expiresAt: Date }>;

  completeConnection(input: {
    subjectId: string;
    callback: Readonly<Record<string, string>>;
    expectedState: string;
  }): Promise<ProviderConnection>;

  listAccounts(connection: ProviderConnection): Promise<ProviderAccount[]>;

  listTransactions(input: {
    connection: ProviderConnection;
    accountExternalId: string;
    cursor?: string;
    from?: Date;
  }): Promise<{
    transactions: ProviderTransaction[];
    nextCursor?: string;
    hasMore: boolean;
  }>;

  refresh(connection: ProviderConnection): Promise<{
    status: "queued" | "complete";
    retryAfter?: Date;
  }>;

  getConnectionHealth(connection: ProviderConnection): Promise<
    "healthy" | "reauth_required" | "temporarily_unavailable" | "revoked"
  >;

  disconnect(connection: ProviderConnection): Promise<void>;
}
```

Adapter requirements:

- Map every provider record to canonical types at the adapter boundary.
- Preserve provider IDs only as opaque external IDs, unique within `(provider, connection)`.
- Page until complete, bound every request, use timeouts, classify retryable errors, respect `Retry-After`, and apply exponential backoff with jitter.
- Make imports idempotent using `(provider_connection_id, external_transaction_id)` plus a canonical fingerprint fallback for fixtures that lack stable IDs.
- Model pending and booked transactions distinctly; allow a booked transaction to supersede a pending one without double counting.
- Treat refresh as asynchronous even when a provider sometimes responds synchronously.
- Never expose provider access tokens to the browser. OAuth/code exchange and data retrieval are server-to-server only.
- `MockBankProvider` must implement the identical contract and fixed scenarios: successful sync, empty account, pagination, duplicate page, pending-to-booked transition, variable subscription, revoked consent, rate limit, and transient outage.

## Tink discovery

### Verified from current public material

- Tink Link is the web/iOS/Android user authentication surface. A user selects a bank, consents, authenticates, and returns to a registered redirect URI.
- Tink markets connectivity across European institutions and coverage of PSD2 accounts plus selected investment, mortgage, savings, and other accounts.
- Tink states that its ready-made authentication flows can operate under its PSD2 licence, but its legal FAQ also warns that Tink's licences do not automatically cover every activity performed by a customer. Legal configuration must therefore be confirmed for SubTrack before production.
- Tink documents scope-based APIs and client/user token distinctions. Connector documentation confirms account and transaction models but is for feeding data into Tink; it is not the ingestion API SubTrack should use.
- Payment initiation is a separate capability and is excluded from MVP1.
- Tink publicly states SOC 2 Type II coverage for security and availability. This supports vendor due diligence but does not replace SubTrack's own controls.

### Tenant capability checklist — must be run in Tink Console

Record evidence, date, and result for each item before calling the Tink adapter complete:

1. Confirm the tenant has the account aggregation/transactions product enabled for market `SE` and obtain the precise API product/scopes.
2. Register development and test redirect URIs; verify exact-match behavior and HTTPS requirements.
3. Identify available Swedish demo institutions/test users and document success, consent rejection, SCA failure, re-authentication, and unavailable-bank scenarios.
4. Confirm the supported authorization-code/session flow, token types, token TTLs, rotation/revocation behavior, and whether refresh credentials may be stored by the client.
5. Fetch account and transaction fixtures; record fields, pagination, ordering, history depth, pending/booked behavior, currencies, stable identifiers, and deletion/closed-account behavior.
6. Determine whether refresh is polling, webhook-driven, or both; verify webhook signing, replay protection, retry schedule, and event ordering if enabled.
7. Verify rate limits, retry headers, sandbox availability expectations, and any tenant-specific base URLs.
8. Verify end-user deletion/disconnect obligations and the supported provider-user deletion endpoint.
9. Confirm commercial/legal path for a later production pilot, including licensing configuration, DPA/subprocessors, supported Swedish institutions, retention constraints, and data residency.

### Go/no-go gate

Go only when a server-side smoke test proves: Link/session creation, state-bound callback, authorization exchange, at least one Swedish sandbox account, paginated transaction retrieval, repeat-sync idempotency, consent revocation/disconnect, and a documented error path. If the tenant cannot provide accounts and transactions, continue product development on the mock provider while commercial access is resolved; do not couple the domain to a guessed endpoint.

## Data model

Core tables and important constraints:

- `users(id, auth_subject, locale, created_at, deletion_requested_at)`; unique `auth_subject`.
- `provider_connections(id, user_id, provider, provider_user_ref, status, consent_expires_at, last_synced_at, encrypted_secret, key_version)`; provider references and secrets never returned by general user queries.
- `accounts(id, user_id, provider_connection_id, external_id, name, type, currency, status, last_seen_at)`; unique `(provider_connection_id, external_id)`.
- `transactions(id, user_id, account_id, external_id, status, amount_minor, currency, booked_at, value_at, description, merchant_key, fingerprint, supersedes_id, imported_at)`; unique external ID when present; check currency/amount invariants.
- `sync_runs(id, connection_id, status, cursor, started_at, finished_at, error_class, counters_json)` and `sync_items` or an equivalent inbox for idempotent processing.
- `merchant_aliases(id, normalized_key, display_name)` and user-scoped overrides separately.
- `recurring_candidates(id, user_id, merchant_key, cadence, confidence_basis_json, next_expected_at, state)`.
- `subscriptions(id, owner_user_id, merchant_key, display_name, cadence, expected_amount_minor, currency, status, source, created_at)`.
- `subscription_evidence(subscription_id, transaction_id)`; owner-only and never traversed by household reads.
- `households(id, name, created_by)`; `household_members(household_id, user_id, role, status, joined_at)` unique per pair.
- `household_invites(id, household_id, token_hash, invited_by, expires_at, accepted_at)`; store only a hash of the invite token.
- `subscription_shares(id, subscription_id, household_id, shared_by, visibility_json, status, created_at, revoked_at)`; unique active share per subscription/household.
- `split_rule_versions(id, share_id, version, rule_type, rule_json, effective_from, created_by)`; immutable after use.
- `settlement_periods(id, household_id, starts_on, ends_on, currency, status, calculated_at)` and `settlement_lines(period_id, share_id, payer_member_id, beneficiary_member_id, amount_minor, rule_version_id)`.
- `settlement_actions(id, period_id, actor_user_id, action, occurred_at)` for mark-complete/reopen history.
- `audit_events(id, actor_user_id, action, target_type, target_id, metadata_json, occurred_at)`; metadata allowlist only, no transaction descriptions or secrets.
- `outbox_events(id, topic, aggregate_id, payload_json, available_at, processed_at, attempts)` for reliable jobs/notifications.

Every financial row includes a three-letter currency. MVP settlement rejects mixed-currency household periods rather than inventing exchange rates. Percentage splits use integer basis points or rational weights; rounding remainders are assigned deterministically by stable member ordering and recorded.

## Recurring detection

Start deterministic and explainable:

1. Normalize merchant text conservatively while retaining original text owner-only.
2. Group only outgoing booked transactions by owner, merchant key, and currency.
3. Require at least two observations for a candidate and three for high-confidence automatic suggestion.
4. Score cadence using robust interval tolerance (weekly, monthly, quarterly, annual) and amount stability using absolute/relative bands.
5. Exclude transfers, cash withdrawal, refunds, charge reversals, and user-dismissed groups.
6. Store the evidence IDs and explanation factors. Never let an LLM determine recurrence, money, splits, or settlement.
7. User-confirmed edits take precedence and are not overwritten by resync.

## Security and privacy controls

- Server-only secrets in a managed secret store; envelope-encrypt provider credentials with a KMS-managed key and versioned rotation.
- Bind callbacks to a cryptographically random, single-use, short-lived `state`; bind sessions to the authenticated subject and exact redirect URI.
- Use secure, HTTP-only, same-site cookies; CSRF protection on mutations; strict CSP, HSTS, frame restrictions, and dependency scanning.
- Enforce authorization in application services and database queries. Every account/transaction/subscription query is owner-scoped. Household queries begin from active membership and active explicit shares, never from transactions.
- Rate-limit auth, connection, invitation, export, and deletion endpoints. Use hashed, expiring, one-time invitation tokens.
- Redact secrets and financial content from logs, traces, analytics, Telegram, support tooling, and exception payloads.
- Record audit events for connection/disconnect, export/delete, invitations, membership changes, share/revoke, split changes, and settlement completion.
- Define retention explicitly: minimize provider payload retention; expire job/error diagnostics; delete or irreversibly anonymize user financial data after the deletion workflow and required grace period.
- Export only the requesting user's data plus their own household-visible projections; do not export other members' private source data.
- Add SSRF/redirect allowlists around provider URLs; do not accept arbitrary callback or webhook destinations.
- If webhooks are enabled, verify provider signatures using raw request bytes, reject stale/replayed events, and process through an idempotent inbox.
- Backups must be encrypted, access-logged, restore-tested, and covered by deletion/retention policy.

Threat-model tests must include broken-object-level authorization, household join/leave, revoked sharing, stale invitations, callback substitution, token leakage, replayed jobs/webhooks, duplicate transactions, and user deletion during sync.

## Delivery milestones and exit criteria

### M0 — Foundation and live capability gate

- Scaffold app, database migrations, authentication, CI, structured logging, audit/outbox, and module boundaries.
- Implement the provider contract plus all deterministic mock scenarios.
- Complete the tenant checklist and sandbox smoke test above.
- Exit: CI green; secrets never reach client/logs; repeated mock and Tink syncs produce no duplicates.

### M1 — Individual subscription loop

- Link sandbox provider, import accounts/transactions, normalize merchants, detect recurring candidates, and support confirm/edit/dismiss.
- Exit: one user completes connect-to-reviewed-subscription flow; pending/booked and pagination tests pass; detection explanation is visible.

### M2 — Household and settlement loop

- Add invitation/member lifecycle, explicit sharing, versioned splits, deterministic settlement, and mark-complete/reopen audit.
- Exit: an unrelated household member cannot access any source transaction; rounding/property tests pass; share revoke takes effect immediately.

### M3 — Privacy and release hardening

- Add disconnect, export, deletion, recovery/error UX, security/privacy test suite, observability, and runbooks.
- Exit: end-to-end MVP success test passes; deletion and restore procedures are evidenced; no sensitive fields appear in telemetry; release branch/commit recorded.

Basic explainable AI insight work is optional after M2 and must consume redacted, aggregated features only. It cannot block or alter deterministic financial outcomes.

## Decisions and open risks

Decided:

- Modular monolith, PostgreSQL, durable worker, deterministic money calculations.
- Tink adapter plus first-class mock provider.
- Explicit subscription sharing; no household access to transaction evidence.
- Single-currency settlement per period in MVP1.
- Polling-compatible synchronization; webhooks are an optimization only after capability verification.

Open risks owned by engineering foundation:

- Tink tenant entitlements and precise transaction API/scopes are unverified without Console access.
- Sandbox behavior may not model production SCA, institution coverage, latency, or data quality.
- Production regulatory configuration and contract/DPA review are separate from sandbox engineering.
- Provider history depth may limit detection of annual subscriptions; fixtures must cover long cadences regardless.

## Sources reviewed

- [Tink documentation home](https://docs.tink.com/)
- [Tink Link authentication overview](https://tink.com/tink-link-authentication/)
- [Tink platform overview and security statement](https://www.tink.com/)
- [Tink legal FAQ: licensing, PSD2 consent, and GDPR distinction](https://tink.com/legal/faq/)
- [Tink payments documentation](https://docs.tink.com/resources/payments)
- [Tink Connector API](https://docs.tink.com/api-connector) — consulted for model/scoping conventions only; not selected as the account aggregation interface
- [Tink changelog](https://docs.tink.com/changelog)

Because Tink documentation and tenant entitlements change, implementation must pin the exact endpoints/scopes proven in Console and record the check date in the adapter README and contract tests.
