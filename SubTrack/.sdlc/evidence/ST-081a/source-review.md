# ST081a independent frozen source review

**Decision: APPROVE the bounded pure decision core. This review does not approve ST-081 completion, integration, or READY status.**

The frozen TypeScript helper matches the accepted ADR-0016 §3 lifecycle table and the ST-081a contract. It returns exactly the 14 listed transitions across the seven statuses and seven actions; every remaining one of the 49 pairs throws a newly created `Error('LIFECYCLE_CONFLICT')`. There are no successful self-status transitions. `ARCHIVED` has no ordinary outgoing transition. The independent literal test oracle enumerates all 49 pairs and asserts 14 accepted results and 35 conflicts.

The runtime boundary is appropriately narrow. `typeof` checks reject non-string values before any object property access. The helper then uses direct case-sensitive string comparisons, so it does not coerce inputs, inspect object properties, or consult inherited keys. Strings such as `__proto__`, `constructor`, and `toString` fall through to the same fixed error. The implementation exposes neither cause nor caller values. The tests cover malformed primitives, wrappers, hostile getters/coercion hooks, revoked proxies, and prototype-looking strings, alongside exact error type/message and absence of a cause.

The source and documentation claim only a calculation from supplied status/action primitives. They do not claim authority over current state, caller authentication, ownership, permissions, versions, replay/idempotency, audit, atomicity, persistence, RLS, or integration. Edit, merge, undo, and missed-charge automation remain outside this helper. This respects the retained ADR-0016 implementation gates: ST-081 remains BLOCKED pending the stated principal/RLS/migration evidence, and persistence-related work also retains the feedback/receipt retention gate. This approval cannot be used to mark full ST-081 or UF06 complete or READY.

## Frozen file hashes

Compared each actual SHA-256 with the corresponding entry in `.sdlc/evidence/ST-081a/source-freeze.json`; all three match:

- `packages/domain/detection/subscription-lifecycle.ts`: `ed347b4e652bfe7f4a9cba0cab0771b7133ce053a2b7daa7e7aee5026d2ae687`
- `packages/domain/detection/subscription-lifecycle.md`: `6c552be5efa32b544bf5e723dab528366a7ba1cd0cb6f4fbde16fa94b90986fa`
- `packages/domain/test/subscription-lifecycle.spec.ts`: `b01bfb65b69e111cdb4a0bf356e075dce883728df573d5e98c54a8b522d0a74a`

## Evidence and scope

Reviewed the specified repository instructions, Constitution, DECISION_RULES §§1 and 4, ADR-0016 §3 and retained conditions, ST-081a task, plan review, root QA note, source-freeze manifest, and all three frozen files. The supplied QA record reports FullDomain 185/12 files PASS, five new cases, actual helper coverage 42/42 branches, 22/22 lines, 36/36 statements, and 2/2 functions, with domain lint, typecheck, and build PASS. These are recorded QA results; this source review did not rerun them.

Call accounting: 3 underlying shell tool calls total: two scoped read calls and this report write. The first read's displayed output was truncated, so the requested ADR lifecycle/retained-gates lines were retrieved in the second read. No command failed. No tests, git commands, network, installs, database actions, or repository edits were performed. Only `/workspace/.setup/ST081a-source-review.md` was written.
