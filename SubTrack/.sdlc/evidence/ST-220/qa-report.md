# ST-220 QA report

Verdict: PASS for local API regression and changed-runtime coverage gates.

- Command: `corepack pnpm --filter @subtrack/api test` from `SubTrack/` with Git usr/bin and Corepack shims prepended to PATH.
- Result: 71 test files passed; 1,415 tests passed. The package lifecycle build and Prisma client generation also completed.
- Coverage artifact: `apps/api/coverage/browser-subscription-read.http.ts.html` reports statements 87.03%, branches 89.56%, functions 89.47%, lines 95.09%; each changed-runtime metric meets the 80% gate.
- Focused test artifact exercises owner/peer projection, identical missing/invisible 404, input/TLS/CSRF rejection, authority recheck after async resolution, masking, and trusted ports. Independent review receipts report focused 41/41; QA did not rerun that focused suite.
- Frozen runtime blob hash before and after regression: `3543b509978079fb433493d1ad34104d5bf112fb` (unchanged).
- Frozen spec blob hash before and after regression: `259187f844f31dc623e4c28123f814a9b701ddd0` (unchanged).
- This verifies package regression behavior only. It does not establish actual HTTPS browser activation or owned-Postgres runtime composition.
- Final independent platform/security verdicts and exact-head CI remain required before merge.
