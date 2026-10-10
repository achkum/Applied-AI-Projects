# Private detection merge decision core

`getDetectionMergeDecision(sourceId, sourceStatus, sourceCurrency, survivorId, survivorStatus, survivorCurrency)` computes the bounded status snapshot for a merge. Source and survivor must have distinct, nonempty primitive string IDs; both statuses must be exactly `DETECTED`; and both nonempty primitive currency identifiers must match exactly. The helper does not trim, normalize, or validate IDs or currencies against external registries.

On success it returns a fresh frozen plain object containing the source and survivor IDs, `sourceStatus: 'ARCHIVED'`, and `survivorStatus: 'DETECTED'`. Reversing the input records reverses the result orientation. Every invalid input throws only a fresh `Error('MERGE_CONFLICT')` without coercion or object-property access.

This is a pure snapshot decision. It does not authorize or perform a merge, authenticate a principal, verify ownership or current state, establish canonical currency, lock revisions, provide idempotency or atomicity, persist an append-only merge link/receipt/audit, or support undo/retention. A caller must independently satisfy those requirements. Amounts and charge/feedback relationships remain outside this helper; it does not sum amounts, reassign associations, or delete relations.
