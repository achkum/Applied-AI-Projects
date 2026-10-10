# ST-212 runtime author checkpoint 1

Status: PARTIAL. Attempt 1 and original elapsed budget continue; do not reset counters. This context made about 25 tool calls, beyond the requested 20-call rotation threshold, so it stops now. No commit, push, PR, DB operation or cleanup.

Source: Phase-1 OpenAPI was the approved blob `342c235ea78dc9b32cb74e578ffa3a5ddafc0aaa` before two quote-only fixes to malformed YAML descriptions. Contract generation produced changed generated artifacts. `redocly lint` then passed. Prisma 6.19.2 API typecheck passed before later test edits. `pnpm install --frozen-lockfile` passed from bundled pnpm, with no lockfile/dependency edits.

Created repository/service/controller and focused service/controller specs under `apps/api/src/subscriptions/`. Repository uses `withRequestTransaction`, RLS, explicit owner-or-non-DETECTED and inbox owner+DETECTED SQL predicates, active-household route, strict tuple keyset before limit+1. Controller is test-only and not in default AppModule. Service emits owner/peer allowlists, exact bigint decimal strings, bound cursor and generic query/detail errors.

First focused run: service 4/4 passed; controller 0/2 failed due Nest guard/provider composition and test-only controller dependency injection. After overriding the guard, controller was 1/2, with 500 caused by undefined service; added explicit `@Inject(SubscriptionReadService)` and removed diagnostics, but **not rerun**. Initial typecheck passed for implementation, then test mocks caused three TS2493 errors; corrected signatures but **not rerun**. Initial lint found nine unused mock parameters; corrected with `void` but **not rerun**. Never claim current green.

Next: rerun focused vitest/typecheck/lint; inspect SQL for enum/permission correctness; add repository tests and test-only real guard→resolver→session-reader HTTP composition plus owned disposable PG16 CI proof using ordinary `subtrack_runtime` LOGIN. Local Docker/psql absent; do not claim PG acceptance from mocks. Contract tests and coverage remain. Root owns final reviews/QA/commit/PR. Heavy local job token is released now.

Potential design risk: `scope=household` SQL includes an owned row whenever viewer has any active membership; if task requires a specific route per owned row, confirm plan language. Currency and stored-row validation should be checked against Money rules. Cursor uses six-digit timestamp text to preserve DB microseconds.
