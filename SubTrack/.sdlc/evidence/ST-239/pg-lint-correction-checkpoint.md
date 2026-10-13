# ST-239 qualified PG lint correction checkpoint

2026-10-11 source1/attempt1. The original 18:18:06.654Z–22:18:06.654Z clock remains unchanged. This narrow correction used 8 tool calls, excluding the initial malformed tool invocation. No hosted qualified PG, browser, pixel, or CI runtime PASS is claimed here.

The C1 hosted lint failure was `no-unsafe-finally` on the checked one-row restore assertion in `apps/api/test/durable-development-login.integration.ts`. The integration still restores the exact natural Bob `public.identity.external_id` row with the original subject, Bob ID, and temporary subject predicate, and requires one returned row. The proof block and restore each capture failure independently. After the restore attempt, either failure is thrown; if both fail, an `AggregateError` carries both causes. The missing-trusted-subject PASS receipt remains reachable only after the proof and restore both succeed. No assertion, fixture, source SQL, skip, or lint rule changed.

Validation: targeted ESLint PASS; full `@subtrack/api` ESLint PASS; installed esbuild bundled parse PASS; `git diff --check` PASS. The source diff is one file, 16 insertions and 1 deletion. SHA-256 of `apps/api/test/durable-development-login.integration.ts`: `D31914363DD37BDB2D8D7ECBD6139E5491506C8AA0E9D033310B23C64B13E15E`.
