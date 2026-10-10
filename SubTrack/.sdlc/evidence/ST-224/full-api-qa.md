# ST-224 Full API QA

- Checkout base: `82b60b94c418c13b515700df468d574a13aa387e` (accepted ST-222 base).
- Frozen adapter source hashes verified: runtime `720a5c7324c03f41ceb4343b0a13ed540dcc8204`; spec `57c5b781bd59c1d2a74b425ba9f8baac13e8492f`.
- Command: `pnpm --filter @subtrack/api test` (includes accepted domain lifecycle build and Prisma client generation).
- Result: PASS, exit 0; Vitest reported 74/74 files and 1,595/1,595 tests passed, zero failures.
- Scope: complete `@subtrack/api` Vitest package suite on this checkout; run output retained privately at `.coverage-st224/full-api.log`.
- Changed-runtime coverage is recorded in the author handoff from the focused adapter run; this full-package run did not collect coverage.
- This suite does not establish isolated HTTPS composition, real browser authority, ordinary-role PostgreSQL/RLS behavior, or race/rollback/cleanup proof.
- No source, dependency, contract, generated-client, status, backlog, or commit changes were made for this QA run.