# ST-223 contract-scope QA report

Result: **PASS for contract scope only.** This verifies the current source contract and generated client artifacts; it does not prove adapter/runtime behavior, browser onboarding, persistent account/session behavior, or production readiness.

## Evidence

- All seven normalized source manifest blobs matched the implementation handoff before checks and still matched afterward:
  - OpenAPI `c2f543e745a5f3d76eebd45a5989aa1d14afc63b`
  - contract tests `f2a6f91778f2f895e59f4c71023e1afe01d343be`
  - lifecycle tests `b5be670f1cbfa6ed0c126885616f4940c7c1ecda`
  - generated index `401f45ceae6614475c41c80d5c33e5de941162d0`
  - generated SDK `b1323dc5e9aed927f1c83ebee0942e76f87fa4a3`
  - generated types `a3e13f174576273c242d80dd76bf058d67514f4e`
  - generated Zod `9238161ed49604b198ff5dd79587ad36da01a810`
- `corepack pnpm --filter @subtrack/contracts test`: PASS; 15 tests, 0 failures/skips, plus generated Zod fixture probe completed successfully.
- `corepack pnpm --filter @subtrack/contracts lint`: PASS; Redocly validated `openapi.yaml`.
- `corepack pnpm --filter @subtrack/contracts typecheck`: PASS; `tsc --noEmit -p tsconfig.json`.
- `git diff --check`: PASS (Git emitted line-ending conversion notices for generated files).
- Source assertions cover strict body/path/security/headers, unavailable-default runtime marker, bounded no-store outcomes, required authority semantics, generated SDK/type/Zod parity, and preservation of V1 PATCH and V2 read contract boundaries.

## Workspace note

The checks ran in the shared worktree. The contract fixture generator left generated artifacts modified under `packages/contracts/generated/**` and `packages/contracts/fixtures/generated/zod.gen.ts`; these were not reverted or deleted. Existing ST-211 evidence and coverage outputs were left untouched. Review the final worktree diff before staging.
## Correction QA — required no-store headers

Result: **PASS for corrected contract scope.** This repeat validates the revised source manifest and the security correction requiring the no-store header on the PATCH success and every bounded problem response. It does not establish runtime adapter/browser behavior, onboarding, persistence, or release readiness.

- All seven revised manifest blobs matched before and after verification: OpenAPI `71f2b27c55cd110678fbe18f8e3abc8779dbf776`; `contracts.test.mjs` `f2a6f91778f2f895e59f4c71023e1afe01d343be`; lifecycle test `61fde74fa466305cce5b1a52fe2f93672efc42e5`; generated index `401f45ceae6614475c41c80d5c33e5de941162d0`; generated SDK `b1323dc5e9aed927f1c83ebee0942e76f87fa4a3`; generated types `a3e13f174576273c242d80dd76bf058d67514f4e`; generated Zod `9238161ed49604b198ff5dd79587ad36da01a810`.
- `corepack pnpm --filter @subtrack/contracts test`: PASS, 15 passed, 0 failed/skipped; generated fixture probe completed and process exited 0.
- `corepack pnpm --filter @subtrack/contracts lint`: PASS, Redocly validation succeeded.
- `corepack pnpm --filter @subtrack/contracts typecheck`: PASS, `tsc --noEmit` succeeded.
- `git diff --check`: PASS; Git printed line-ending conversion notices for generated files.
- The corrected route test asserts `required: true` and `const: no-store` on the 200 response and resolves 400/401/403/404/409/500 response references to assert the same required header. No source or manifest drift occurred during these checks.
- Checks ran in the shared worktree. Existing fixture/generated artifact modifications and unrelated ST-211 evidence/coverage were preserved. No commit or status/backlog change was made.
