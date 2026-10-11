# ST-238 C1 contract compatibility correction

Scope: `packages/contracts/tests/contracts.test.mjs`, `v2-auth.test.mjs`, and `private-onboarding.test.mjs` only. No OpenAPI or API source changed.

The public C1 quality job 114525556559 in run 38158246078 failed three contract predicates. The operational availability inventory omitted the reviewed mode choice, mode read, and owner page read routes. The private response test used `new URL('..', import.meta.url).pathname.slice(1)`, which produced a nonexistent Linux bundle root and `spawnSync.status === null`. The v2 POST test treated the three new private routes as legacy mutating POSTs, reporting 13 instead of 10. The prefixture log establishes these failures before the fixture check.

Corrections preserve the frozen legacy semantic hash and exact v1/operational inventory. The availability assertion now inventories all three reviewed `unavailable-default` routes. The private bundle root uses `fileURLToPath`, and the test checks mode choice/read and owner page exact success/error response codes and references as well as existing detail/status privacy codes. The v2 test explicitly classifies all 15 POST paths: the original 10 retain Idempotency-Key, generic duplicate/recovery and nonce/Origin checks; the five reviewed private browser POSTs declare Origin and current-session CSRF, and have no Idempotency-Key. It also checks closed read bodies and mode repeat as a side-effect-free committed readback with no retry after uncertainty. No test was skipped or relaxed to accept an unknown route.

Verification: `corepack pnpm --filter @subtrack/contracts test` exited 0 on Windows after a temporary PATH-local `pnpm.cmd` forwarder supplied the package script's nested `pnpm` invocation. The forwarder was removed. Node test suite: 27 passed, 0 failed, 0 skipped; generated Zod fixture command and probe completed. `git diff --check` passed. No generated file was modified by validation.

Independent platform/security delta review and actual CI remain Conductor gates. This author has not committed, pushed, or approved the change.
