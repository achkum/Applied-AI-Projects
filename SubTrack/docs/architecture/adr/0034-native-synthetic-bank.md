# ADR0034: Owner-only development Synthetic bank workflow

Status: accepted for source implementation after independent platform/privacy plan GO; actual execution/acceptance remains unqualified. Existing authorized local/test owner model, no foreign/production purge or household visibility expansion.

## Frozen purge constants

Exact name AND entire string including whitespace; strings have no leading/trailing newline. Every other DELETE/quotes/comments/unsafe statement remains rejected by the current validator. No normalization or SELECT bypass.

### bankPurgeTransactions

```sql
DELETE FROM public.raw_transaction AS rt
USING public.bank_account AS ba,
      public.bank_connection AS bc,
      st248_bank.generation AS bg
WHERE rt.identity_id = $1::uuid
  AND ba.identity_id = $1::uuid
  AND bc.identity_id = $1::uuid
  AND bg.identity_id = $1::uuid
  AND rt.account_id = ba.id
  AND ba.connection_id = bc.id
  AND bg.connection_id = bc.id
  AND bc.id = $2::uuid
  AND bc.provider = 'SYNTHETIC'::public.bank_provider
  AND bc.institution_id = 'synthetic-demo-v1'
  AND bc.status = 'REVOKED'::public.bank_connection_status
  AND bc.revoked_at IS NOT NULL
  AND bg.fixture_version = 'solberg-v1'
  AND bg.purged_at IS NULL
  AND bc.identity_id::text = pg_catalog.current_setting('app.user_id', true)
  AND bc.identity_id::text = pg_catalog.current_setting('app.current_user_id', true)
RETURNING rt.id::text AS id
```

### bankPurgeAccounts

```sql
DELETE FROM public.bank_account AS ba
USING public.bank_connection AS bc,
      st248_bank.generation AS bg
WHERE ba.identity_id = $1::uuid
  AND bc.identity_id = $1::uuid
  AND bg.identity_id = $1::uuid
  AND ba.connection_id = bc.id
  AND bg.connection_id = bc.id
  AND bc.id = $2::uuid
  AND bc.provider = 'SYNTHETIC'::public.bank_provider
  AND bc.institution_id = 'synthetic-demo-v1'
  AND bc.status = 'REVOKED'::public.bank_connection_status
  AND bc.revoked_at IS NOT NULL
  AND bg.fixture_version = 'solberg-v1'
  AND bg.purged_at IS NULL
  AND bc.identity_id::text = pg_catalog.current_setting('app.user_id', true)
  AND bc.identity_id::text = pg_catalog.current_setting('app.current_user_id', true)
RETURNING ba.id::text AS id
```

Both parameters: $1 exact current authority owner.identityId; $2 validated owned connection UUID from strict disconnect body, locked and bound to Synthetic generation first. Exact two canonical UUID values; execute verifies first parameter current owner. Returned IDs internal only, outward bounded counts.

## Persistent generation and RLS
Connection UUID is immutable generation. provider_connection_id stays NULL because Synthetic provider has no actual connection identifier. st248_bank.generation: connection_id PK plus identity_id composite FK to bank_connection(id,identity_id) RESTRICT, fixture_version fixed solberg-v1, nullable monotonic purged_at. Owner immutable; runtime SELECT/INSERT and column UPDATE(purged_at), no DELETE. No names/credentials/fixture JSON.
Immutable owner/key/requesthash/operation/connection mutation receipt with bounded typed fields and owner/key uniqueness, RESTRICT retained generation FK, no runtimeUPDATE/DELETE.
Exact ENABLE/FORCE RLS list: public.bank_connection, public.bank_account, public.raw_transaction, st248_bank.generation, st248_bank.receipt. Existing public owner policies unchanged; new private policies require public.subtrack_principal_matches(identity_id). No role/global grant/service policy/BYPASSRLS/SECURITY DEFINER. Qualified private PG16 custody remains required.
Partial unique active institution index scoped provider SYNTHETIC, institution synthetic-demo-v1, status ACTIVE and identity. Fresh reconnect new connection UUID; tombstone/receipt/generation retained.

## Atomic transaction invariants
Within current verified authority identity/session lock and profile-complete Just-me gate, check immutable replay receipt and canonical request fingerprint. Lock owned connection/generation, validate fixed provider/institution/version/GUC/disposition. Revoke/set revoked_at before purge, raw_transaction then bank_account exact statements, check command/count/returned row shape, verify no remaining owned banking rows, set purged_at and append immutable receipt. Final authority epoch/session/expiry fence before commit. Any FK/state/result/fence error rolls back all changes; never cascade/detach subscription_charge or paying_subscription dependencies, which remain RESTRICT. No compensation/retry after commit uncertainty. Purge retains all unrelated manual subscription digests. Successful receipt replay does not rerun/recreate; fresh-key already-purged request is a truthful no-op. Sync requires ACTIVE/unpurged and cannot resurrect generations.

Exact contracts/runtime prerequisites, server-bound Solberg fixture, stable per-charge IDs AND RNG, UTC/shifted-window filtering and genuine PG/native acceptance are in task ST248. No source/acceptance/release approval inferred from this proposal.

## Isolated tester adapter and upgrade implementation
The existing native Bank page is shared across production and sandbox. The tester adapter admits only the closed bank-read/connect/sync/disconnect variants through the existing installation authority; it cannot select an owner or create production enrollment proof. Production defaults remain unchanged. Isolated migration003 adds the same reviewed owner/RLS and exact two-statement purge semantics while preserving historical001/002/private016 bytes. The fixed lifetime quotas and cleanup reservation in ST248 apply to retained generations and receipts.

Upgrading an initialized sandbox is an explicit maintenance operation. It authenticates old and new source/image/manifest custody, retains original volume records and labels, seals a bounded intent, verifies the actual database transition and ordinary-role startup, then records a receipt before recoverable marker advancement. Missing or mixed authority fails closed. No reset, relabel, real provider or production release is implied. Source review is complete; actual isolated PostgreSQL and installed Android/iOS acceptance remain required.
