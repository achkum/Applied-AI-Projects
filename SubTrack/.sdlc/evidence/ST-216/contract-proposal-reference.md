# ADR-0023: Owner lifecycle HTTP contract

Status: proposed contract decision (ST-215, 2026-10-10). Type 2a under `DECISION_RULES.md`; route activation is separate.

## Context

`API_CONTRACT.md` listed a broad subscription PATCH with edit fields while OpenAPI had no PATCH. UF-08 asks for pause, cancellation and archive, and ADR-0016 §3 establishes ordinary lifecycle actions. The ST-215 security/privacy and product readiness reviews approve a bounded contract reconciliation without new audit, replay or retention state. Broader edit, review and undo requirements still need separate contracts.

## Decision

Add a contract-only `PATCH /v1/subscriptions/{id}` accepting exactly `{ "status": target }`, where target is `ACTIVE|PAUSED|CANCELLED|ARCHIVED`. Reject extra or mixed fields and all query selectors. Path is UUID. Use only accepted V1 current-session Bearer identity; caller-supplied owner/action/scope identity is never authority. The private writer checks ownership and the locked current status under transaction-local RLS, then accepts exactly:

| Locked current | Target | Action |
| --- | --- | --- |
| ACTIVE | PAUSED | pause |
| ACTIVE | CANCELLED | cancel |
| ACTIVE | ARCHIVED | archive |
| PAUSED | ACTIVE | resume |
| PAUSED | CANCELLED | cancel |
| PAUSED | ARCHIVED | archive |
| CANCELLED | ARCHIVED | archive |

All other pairs, including same-status, DETECTED, TRIAL, REJECTED and ARCHIVED, conflict. Target selects the action deterministically (`ACTIVE→resume`, `PAUSED→pause`, `CANCELLED→cancel`, `ARCHIVED→archive`); no unlocked read drives dispatch. A success response contains only `{id,status}`. RFC 9457 problems are 400 for malformed path/body/target/query, 401 for absent/invalid principal, identical 404 `SUBSCRIPTION_NOT_FOUND` for missing and owner-invisible IDs, 409 `LIFECYCLE_CONFLICT` for stale/disallowed pairs, and masked 500 for storage faults. Errors carry no private resource or driver details.

An uncertain response may follow a committed write. A retry can return 409, so the client re-reads authoritative state. This slice adds no replay receipt, idempotency persistence, exactly-once guarantee, new ordinary audit event, or retention state. ADR-0016's future review/edit/undo receipt requirements remain separate.

## Consequences and gates

OpenAPI and generated client/Zod schemas describe this status-only operation. `API_CONTRACT.md` retains `name/category/cadence/alwaysPrivate/catalogPlanId` edits as a future broader roadmap, with their mixed use rejected here. This does not complete ST-081, UF-06, review/feedback/undo, or missed-charge automation. No HTTP route or new identity model is enabled by this ADR. Runtime work still needs accepted ST-081c private writer, verified current-principal binding, ordinary-role PostgreSQL RLS/rollback/concurrency proof, and independent security review at the exact head.
