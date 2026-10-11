# ST-226 Full API QA
Verdict: FAIL; exact-head full API run exited 1. No implementation files changed during QA.
Head: ee9225ccab444d6a8404ccf41e5cd42b3c31ce95; branch st/ST-226-owned-browser-lifecycle-launcher.
Fresh `corepack pnpm --filter @subtrack/api test`: 64 test files passed, 12 failed; 1,575 tests passed, 91 skipped (1,666 total).
Private raw output retained at `apps/api/.coverage-st226/full-api.log`; raw output intentionally omitted from this receipt.
C3 coverage JSON: statements 92.94%, branches 89.65%, functions 86.95%, lines 97.52% (all above 80%).
C3 checkpoint records focused 26 PASS and build/lint/typecheck PASS; actual finish cleanup negatives PASS (prior run, not rerun).
Local Docker/psql unavailable; actual ordinary-PG compiled TLS smoke remains unproven here and exact-head Linux CI is required.
Frozen blobs: lifecycle.ts 2160895f61241f639f1cf97a0d06002a07ef7957; lifecycle.spec.ts 9cf39a803c2f1e1fcdbf812b5713d8f19cb60130; integration.ts e9f721087b6447993a8107c5fde46c6a3e55c52b; vitest.config.ts cd120639f208cc83571f61322430a082314f777d.
Frozen blobs: proof.sh 215c50c9a64f814cade725d440166e51e46d0cdf; test-proof.sh 65e1ce98a216ce60786e7d03dfe29208f20119e6; workflow.yml 05d874d38084337377f3104ac1978e8a2dc60098.