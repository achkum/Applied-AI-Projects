# Data Model (PostgreSQL 16, Prisma schema is the implementation)

## Conventions
- All IDs are UUIDv7 (time-sortable).
- Every table has `created_at` and `updated_at`.
- Soft delete is used only where stated; GDPR deletes are hard.
- Money: `amount_minor BIGINT` + `currency CHAR(3)`. There are no floats anywhere near money.
- Tenancy columns: `user_id` (personal data) and/or `household_id` (shared data).
  - RLS policies use `current_setting('app.user_id')`, set per request by the API.
- Enums are Postgres enums, mirrored in `packages/contracts`.

## Entities

### Identity
- **user**: id, email?, phone_e164?, display_name, avatar_color, avatar_emoji, locale (`sv`|`en`), theme (`system`|`light`|`dark`), default_currency, status (`ACTIVE`|`PENDING_BANKID`|`DELETED`)
  - Unique constraints on email and on phone.
- **identity_verification**: id, user_id, method (`BANKID_TEST`|`BANKID_SIMULATOR`), personnummer_hmac (unique), given_name, surname, verified_at
- **otp_challenge**: id, identifier_hash, channel (`EMAIL`|`SMS`), code_hash, expires_at, attempts, consumed_at
- **session / device**: id, user_id, device_name, platform, refresh_token_hash, last_seen_at, revoked_at
- **push_token**: user_id, expo_token, platform

### Household
- **household**: id, name, emoji, cover, created_by
- **household_member**: id, household_id, user_id? (null for a dependant), display_name, role (`ADMIN`|`MEMBER`|`DEPENDANT`), status (`ACTIVE`|`LEFT`|`REMOVED`), open_book (bool, default false), joined_at
  - Partial unique index: one ACTIVE ADMIN per household.
- **invitation**: id, household_id, invited_by, channel (`LINK`|`CODE`|`EMAIL`|`SMS`), target?, token_hash, code, status (`PENDING`|`OPENED`|`ACCEPTED`|`DECLINED`|`EXPIRED`|`REVOKED`), expires_at, responded_by_user_id?

### Banking (always private to user_id)
- **bank_connection**: id, user_id, provider (`TINK_SANDBOX`|`SYNTHETIC`|`TINK_LIVE`), institution_id, institution_name, status, consent_expires_at, encrypted_credentials (AES-GCM blob: tokens only; bank passwords are never stored), last_synced_at
- **bank_account**: id, connection_id, user_id, provider_account_id, name, type, iban_last4, currency
- **transaction**: id, account_id, user_id, provider_txn_id, amount_minor (negative = outflow), currency, original_amount_minor?, original_currency?, booked_date, value_date?, status (`PENDING`|`BOOKED`), raw_description, merchant_id?, provider_category?, is_refund, dedupe_hash
  - Unique on (account_id, provider_txn_id).
- **raw_provider_payload**: id, connection_id, payload jsonb, fetched_at
  - Purged after 30 days by a job.

### Catalogue & detection
- **merchant**: id, canonical_name, slug, category_code, logo_url?, website?, country
- **merchant_alias**: id, merchant_id, pattern (normalised string or regex), source (`SEED`|`RULE`|`ML`|`USER`), confidence
- **catalog_plan**: id, merchant_id, plan_name, cadence, price_minor, currency, market (`SE`), features jsonb, source_url, verified_at, source (`SEED`|`SCRAPER`|`MANUAL`)
- **catalog_price_observation**: id, catalog_plan_id, price_minor, observed_at, source_url, scrape_run_id
- **subscription**: id, user_id (the payer's user), merchant_id?, custom_name?, category_code, cadence (`WEEKLY`|`MONTHLY`|`QUARTERLY`|`SEMIANNUAL`|`ANNUAL`|`CUSTOM`), expected_amount_minor, currency, status (`DETECTED`|`TRIAL`|`ACTIVE`|`PAUSED`|`CANCELLED`|`ARCHIVED`|`REJECTED`), source (`DETECTED`|`MANUAL`), confidence (0–1), detection_reasons jsonb, catalog_plan_id?, paying_account_id?, next_charge_date, always_private (bool)
- **subscription_charge**: subscription_id, transaction_id, matched_by (`ENGINE`|`USER`)
- **price_event**: id, subscription_id, old_amount_minor, new_amount_minor, effective_date, kind (`INCREASE`|`DECREASE`|`PLAN_CHANGE`)
- **detection_feedback**: id, subscription_id?, transaction_id?, user_id, label, created_at
  - Feeds the ML training set.

### Sharing & money
- **subscription_share**: id, subscription_id, household_id, owner_type (`PERSONAL`|`SHARED`), shared_by, shared_at, revoked_at?
- **split_rule**: id, subscription_share_id, rule_type (`EQUAL`|`PERCENT`|`FIXED_REMAINDER`|`CUSTOM`), effective_from, effective_to?
- **split_allocation**: split_rule_id, household_member_id, basis_points? (0–10000), fixed_minor?, is_remainder bool, excluded bool
- **settlement_period**: id, household_id, period (YYYY-MM), status (`OPEN`|`COMPUTED`|`SETTLED`), computed_at, settled_at?, note?
- **settlement_line**: period_id, from_member_id, to_member_id, amount_minor, currency
- **settlement_item**: period_id, subscription_id, charge_transaction_id, payer_member_id, allocations jsonb (member → minor)

### Intelligence
- **insight**: id, scope_type (`USER`|`HOUSEHOLD`), scope_id, kind (`FORECAST`|`ANOMALY`|`PRICE_HIKE`|`BETTER_TOGETHER`|`PERSONA`|`RECAP`|`COMPARISON`), payload jsonb (numbers from deterministic code), narrative_sv?, narrative_en?, model_version, created_at, dismissed_at?
- **forecast_point**: scope_type, scope_id, month, p10_minor, p50_minor, p90_minor, model_version
- **ml_model_registry**: name, version, trained_at, metrics jsonb, artifact_path, model_card_path

### Governance
- **consent**: id, user_id, kind (`TERMS`|`PRIVACY`|`BANK_DATA`|`HOUSEHOLD_SHARING`|`AI_INSIGHTS`), version, granted_at, revoked_at?
- **audit_log**: id, actor_user_id?, household_id?, action, target_type, target_id, metadata jsonb (no PII), prev_hash, hash, at
  - Hash-chained. This reuses the existing prototype's design.
- **notification**: id, user_id, type, payload, read_at, delivered_channels

## Visibility rule (the single most important query rule)
A household member **M** may see a subscription **S** owned by user **U** within household **H** if and only if at least one of these holds:

1. M.user_id = U (it is their own), or
2. There exists an **active** `subscription_share` for S in H (explicitly shared), or
3. U is an ACTIVE member of H **and** U.open_book = true **and** S.always_private = false.

This is implemented once, in `SubscriptionVisibilityPolicy` in the API. RLS mirrors it, and it is covered by a property-based test that generates random households.
Transactions are **never** visible to anyone except their owner. Other members see only the aggregates on shared or visible subscriptions.
