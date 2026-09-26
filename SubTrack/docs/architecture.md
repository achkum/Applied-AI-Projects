# Foundation architecture

## Boundaries

- `domain/banking.ts` owns normalized bank data and the provider contract. Tink will be an adapter, not a domain dependency.
- `providers/mock-bank-provider.ts` supplies stable sandbox-like fixtures for tests and local development.
- `auth/credentials.ts` owns password hashing and opaque session-token creation/verification.
- `domain/consent.ts` records explicit, versioned grants and revocations.
- `domain/audit.ts` creates immutable, hash-chained audit entries through a replaceable store.
- `db/migrations` defines persistence and row-level ownership constraints.

## Invariants

Money is represented as integer minor units with ISO currency codes. Provider IDs are namespaced by connection. Raw provider payloads, credentials, and tokens never enter audit metadata. Consent history is append-oriented and cannot be silently overwritten. Audit hashes cover the previous hash and canonical event content, making mutation detectable.

## Next adapters

Implement PostgreSQL repositories behind the service interfaces, then a `TinkBankProvider` using Sandbox credentials held in a managed secret store. Provider webhooks and ingestion jobs should be idempotent on `(connection_id, provider_transaction_id)`.
