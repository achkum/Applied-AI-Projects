# ST-211 test-fix QA

**QA: PASS** — independent review of the current `EnrollmentFlow.test.tsx` diff.
Awaiting the action promise ensures async state settles; assertions and all seven tests remain intact. `afterEach(jest.restoreAllMocks)` restores spies, including on failure.
Focused run: `corepack pnpm --filter @subtrack/mobile test -- --runInBand src/state/EnrollmentFlow.test.tsx` — 1 suite, 7 tests passed.
No timeout was increased; no test was skipped or weakened. No privacy concern found in the change.
Normalized full-source SHA-256 (LF): `c13b867edfdfbf36d836c2776441ecbab82e3ab9d7fe717bba75e4ac3e298477` (238 lines).
CI record supplied for PR 239 reports first-test 5,000 ms timeout and 128 passed; resource contention is plausible but unproven as the cause.
This approves the test fix only; exact-head CI and remaining ST-211/native/provider gates remain outstanding.
