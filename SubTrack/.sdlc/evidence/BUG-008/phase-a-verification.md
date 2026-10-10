# BUG-008 Phase A schema target verification

2026-10-10 · architect-platform/data authoring · **artifact-only, pending independent exact-schema review**.

## Scope and source

The founder's current inventory is **no SubTrack databases** (`founder-inventory.md`). This work changes only `apps/api/prisma/schema.prisma`, adds `apps/api/prisma/reconciliation-target.json`, and records this evidence. No migration SQL, database, provider, runtime, endpoint, default activation, deployment, or task metadata was changed. `reconciliation-plan.md` including its security corrections and `security-plan-review.md` bound this target. Accepted ADR-0016 keeps charge details owner-only and BUG-013's two transaction-local principal settings; neither is implemented here.

Historical source hashes (SHA-256) before Phase B: `0002_banking_catalogue_subscription/migration.sql` = `9FB4DBCB1FA525F9999EC751A5FD42B2904B33DBAB9A7515AF44851F1236DFC6`; `0002_subscription_visibility/migration.sql` = `A47FAB7ED629DF5E0FEA2A89BF3A649570A74BE548569FB369D7D8ADB5C6602B`. These both define incompatible `subscription_status` and `subscription`, and the former's charge policy leaks through household visibility. The first migration's banking/catalogue/charge capability is retained as a target, not executed history.

## Source and schema choices for independent review

- Six absent models are `BankConnection`, `BankAccount`, `RawTransaction`, `Merchant`, `CataloguePlan`, and `SubscriptionCharge`. Existing identity, OTP, session, invitation, household, consent, audit, subscription, and share fields stay in place. The physical catalogue table remains `catalogue_plan`; the logical subscription link is `catalog_plan_id`.
- Ownership is the existing physical `identity_id`. `(id, identity_id)` unique keys on connection, account, transaction, and subscription support composite foreign keys: account→connection, transaction→account, subscription paying account→account, charge→subscription, and charge→transaction. SQL still must prohibit owner reassignment. No household path grants transaction or charge detail.
- Bank providers are exactly `TINK_SANDBOX`, `SYNTHETIC`, `TINK_LIVE`; no legacy `TINK`/`MOCK` alias. Nullable provider connection ID avoids inventing a synthetic provider fact. Connection institution ID/name, status, encrypted token bytes, expiry and sync/revocation times are explicit. Account `OTHER` does not silently convert an upstream `UNKNOWN` type; ingestion needs an explicit mapping.
- Raw transaction uses required source event `transaction_date` (date), optional `booked_at` (instant), and optional `value_date` (date). Status is required `PENDING`/`BOOKED`, with no BOOKED default and no fabricated booking instant. Original amount/currency are nullable as a pair; their pair check is a SQL obligation. Provider transaction identity is unique per account. ST-067's source `date`/`pending` and numeric amount need explicit, exact Money conversion before any persistence. No raw provider payload is stored until its owner-only access and 30-day purge boundary are implemented.
- Merchant `aliases` JSON retains the old seed alias content path; no empty alias default fabricates it. Slug, category and country are new canonical catalogue fields. `CataloguePlan` maps to `catalogue_plan`; price is required BIGINT, market has no global SE default, and source URL/verification time are nullable so illustrative seed values do not claim verified prices. Old `region`/`active` have no identified consumer in this bounded target and are not included; reviewers should check that choice before SQL.
- Subscription preserves its current canonical amount, cadence, seven-state status, privacy and share shape. It adds required source (`DETECTED`/`MANUAL`), optional confidence and detection reasons, optional catalogue/paying-account links, and optional next charge date. Confidence has no default and needs a SQL 0..1 check. The older banking migration's `display_name`/`amount_minor`/`period` and first/last seen metadata do not replace the canonical fields; no current consumer of optional first/last seen metadata was identified. Share timestamp shape is unchanged. SQL must enforce active-share uniqueness, owner-authorized creation, departed-owner revocation, and no retarget/revival.
- Charge retains the old SQL captured amount/currency/date and adds owner, optional transaction, and optional match actor. Manual charge means both `raw_transaction_id` and `matched_by` null; a linked charge requires both. SQL must check that correspondence. Captured values for a linked charge require source agreement at association or a separately reviewed write contract. Charge `charged_at` is a source-backed date, never a fabricated default. The nullable transaction ID is unique when present.

`reconciliation-target.json` is the independent expected object/enum/key/FK/check/RLS/grant checklist for future SQL and PostgreSQL comparison. Its SQL-only obligations are **not** enforced merely by Prisma validation or these relations. In particular, Prisma cannot prove RLS, immutable IDs, partial active-share uniqueness, confidence bounds, pair/match checks, source-capture agreement, role grants, helper safety, or least-privilege execution.

## Local artifact checks

From `apps/api`, with a dummy `DATABASE_URL` used only to satisfy Prisma schema parsing:

| Check | Result |
| --- | --- |
| `corepack pnpm exec prisma validate --schema prisma/schema.prisma` | PASS, Prisma 6.19.2 |
| `corepack pnpm exec prisma generate --schema prisma/schema.prisma` | PASS, Prisma Client 6.19.2; local ignored generated client only |
| `corepack pnpm exec tsc --noEmit -p tsconfig.json` | PASS |
| JSON parse of `reconciliation-target.json` | PASS; eight target tables enumerated |
| `git diff --check -- apps/api/prisma/schema.prisma` | PASS |

No migration was applied and no PostgreSQL instance was contacted. These checks establish syntax and API type compatibility only. Phase B requires exact architect-data/platform/security source review before SQL; then clean-install parity and owner/share/RLS/role/rollback/pool tests on disposable PostgreSQL 16, with separate migration and verified non-superuser non-BYPASSRLS runtime roles.
