# ADR-0029: Private awaited development bootstrap lifecycle

- Status: Proposed Type 2a architecture for ST-233j; private source acceptance only.
- Date: 2026-10-11.

## Decision

The existing browser nonce reference path issues and settles synchronously in a process-local store. The proposed private development-only lifecycle awaits a trusted transaction port. It captures the accepted H nonce and I global-burn producer handles internally, compares their origin, epoch, manifest and purpose, then passes the same frozen complete burn witness to each port step. Callers supply only a primitive idempotency key and existing browser purpose. Neither a caller-created tuple nor a TypeScript brand establishes runtime provenance.

The port independently commits the global burn before attempting the operation. Only a resolved known-committed reserve permits one operation attempt. That operation must atomically insert the nonce and settle the fully owned pending burn completed on the same connection and transaction. Only a confirmed durable commit permits closure-private plaintext disclosure. A proven rollback permits one conditional failed settlement; uncertain commit, throw, malformed result or failed settlement ends generically without retry, replay or compensation. SQL owns observed time, expiry, admission and full tuple rematch. Port outcomes in mock tests are claims, not PostgreSQL proof.

## Deferred proof and activation

The current `reserve_bootstrap` and `settle_bootstrap` SQL functions do not themselves provide nonce INSERT plus completed settlement in one transaction. A separately reviewed adapter and disposable PostgreSQL test must prove independent durable burn, complete owned rematch, same-connection atomic operation and settlement, commit ambiguity handling, timestamp/expiry/capacity admission, and crash and duplicate behavior. Previous-cookie global cross-purpose LIVE invalidation remains a separate unresolved SQL and transport contract. The lifecycle remains unregistered until these and browser cookie/Origin prerequisites are reviewed.

This decision adds no SQL, schema, grant, HTTP, storage, API, production or public authority. A concrete later security-model change requires its own classification and decision; this Type 2a acceptance does not grant it.
