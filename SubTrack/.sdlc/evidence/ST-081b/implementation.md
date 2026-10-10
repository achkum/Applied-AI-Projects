# ST-081b implementation evidence

Implemented the private `getDetectionMergeDecision` helper and local contract documentation in the task-owned paths. The helper checks all six arguments are primitive strings before using string properties/comparisons, then requires nonempty distinct IDs, exact `DETECTED` statuses, and equal nonempty currency strings. Success returns a fresh frozen plain status snapshot in source/survivor order. Invalid inputs produce a new fixed `Error('MERGE_CONFLICT')`. No export barrel or caller authority was added.

The focused spec contains a literal 49-pair status oracle and validates every slot against malformed primitive, object, symbol, function, boxed-string, and revoked-proxy values. It also checks exact error shape, non-coercion/no getter access, whitespace-preserving comparisons, orientation, immutability and frozen result shape.

## Verification

- `corepack pnpm --filter @subtrack/domain exec vitest run test/detection-merge.spec.ts` — 4 tests passed.
- `corepack pnpm --filter @subtrack/domain test` — 13 files and 189 tests passed.
- `corepack pnpm --filter @subtrack/domain test:coverage --coverage.reporter=json-summary --coverage.reporter=text --coverage.include=detection/detection-merge.ts` — helper statements 7/7, branches 18/18, functions 2/2, lines 6/6 (100% each).
- `corepack pnpm --filter @subtrack/domain lint` — passed.
- `corepack pnpm --filter @subtrack/domain typecheck` — passed.
- `corepack pnpm --filter @subtrack/domain build` — passed.
- `git diff --check` — passed.

This evidence covers only the local pure decision core. It does not establish principal binding, ownership, canonical currency, revisions, transaction atomicity, idempotency, persistence, merge-link/receipt/audit, undo, retention, or UF-06 completion; ST-081 remains blocked as recorded in ADR-0016.

## Independent review

Architect-data/QA review confirms the literal matrix, six-argument malformed checks, fixed-error/no-coercion behavior and actual 18/18 branch summary. Initial REQUEST_CHANGES concerned only generated evidence outside allowed paths. Root moved the files to this allowed ST-081b directory; reviewer rechecked and returned APPROVE with no source changes or test reruns. Own helper export only; no public barrel or API exposure. Required CI remains pending.
