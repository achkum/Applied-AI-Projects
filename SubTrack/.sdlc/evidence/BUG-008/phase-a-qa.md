# BUG-008 Phase A independent QA

2026-10-10 · independent QA · branch `st/BUG-008-clean-schema-reconciliation`

**Disposition: Phase A artifact validation passes; Phase B SQL and database proof remain unapproved by this QA.** The checked schema and fixture match the exact hashes already listed in the platform and security reviews:

- `apps/api/prisma/schema.prisma`: `EE08405408AD04D5917263FEDE3FF09604EAFEFD40ED37DD1811669D92E20AEC`
- `apps/api/prisma/reconciliation-target.json`: `3FB7C637EE7EFBC7AFF6422428EEA6338550FE153F14B11CFD4605F0F8911FC4`

## Commands and results

From `apps/api`, set `DATABASE_URL` to the parser-only dummy value `postgresql://phase_a_parser_only:phase_a_parser_only@127.0.0.1:5432/phase_a_parser_only?schema=public`, then ran:

- `corepack pnpm exec prisma validate --schema prisma/schema.prisma` — PASS, Prisma schema valid.
- `corepack pnpm exec prisma generate --schema prisma/schema.prisma` — PASS, generated Prisma Client v6.19.2 in the workspace's ignored generated-client location.
- `corepack pnpm exec tsc --noEmit -p tsconfig.json` — PASS (exit 0).

From repository root:

- Parsed `reconciliation-target.json` with PowerShell `ConvertFrom-Json` — PASS; eight target tables and nine enums.
- `git diff --check -- apps/api/prisma/schema.prisma apps/api/prisma/reconciliation-target.json` — PASS.
- `git diff --name-only -- apps/api/prisma/migrations` and `git diff --name-only -- apps/api/src` — empty. No migration or runtime source diff is present.

The fixture names all eight intended relations: `bank_connection`, `bank_account`, `raw_transaction`, `merchant`, `catalogue_plan`, `subscription`, `subscription_share`, and `subscription_charge`. Reviewed the schema declarations and fixture values for owner-scoped composite relations, minor-unit `BigInt`, canonical provider/status/cadence enums, and date-vs-instant fields. The schema contains the required transaction `PENDING`/`BOOKED` status, source `transaction_date`, nullable `booked_at`, nullable `value_date`, and date-valued charge/next-charge fields. Charge and transaction models carry `identity_id` and the composite relations constrain linked records to the same owner. No `raw_provider_payload` table is present.

## Limits and follow-up

Prisma validation, generation, and TypeScript compilation prove parser/client/API type compatibility only. `DATABASE_URL` was a dummy parser input; no connection, SQL, migration, or database command was run, and no RLS or grants behavior is established. No API tests were needed because API/runtime source is unchanged.

The fixture includes a partial unique key for non-null `bank_connection.provider_connection_id`; Prisma's ordinary composite `@@unique` is compatible with PostgreSQL's default multiple-NULL uniqueness behavior, but does not encode a `WHERE` predicate. Phase B SQL and fixture comparison must preserve and explicitly verify the intended non-null uniqueness. Other SQL-only obligations remain as recorded in the fixture and prior reviews: RLS/grants, immutable ownership, checks and charge capture agreement, policy helper safety, and least-privilege PostgreSQL 16 proof.
