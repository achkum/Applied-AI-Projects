# ST-222 author source freeze candidate

Frozen Type 2a plan Git blob: `a59a24f11d3c9c59c70078b5e5cf35c5af461bd8`.
The following are `git hash-object` blobs for the final author draft before Conductor commit. If the author changes source, replace this manifest and rerun focused checks before final review.

| Path | Git blob |
| --- | --- |
| `.github/workflows/subtrack-browser-subscription-read-proof.yml` | `24259806a74090e505774375f6fb30f91d77a480` |
| `SubTrack/apps/api/package.json` | `9a64a85c8003b5aa834253d421a36d9a09510dcd` |
| `SubTrack/pnpm-lock.yaml` | `8179b4f20c91aa5a9297b6f6e97f941c03906327` |
| `SubTrack/apps/api/src/subscriptions/browser-subscription-read.local.ts` | `6f63274f7067b3304071ce2b9c43f74fc1ef7081` |
| `SubTrack/apps/api/src/subscriptions/browser-subscription-read.local.spec.ts` | `6146ed7f32ae85ac5416d7d380127670d9ded983` |
| `SubTrack/apps/api/test/browser-subscription-read.integration.ts` | `891e289254a3f3fd12419c0cfed7fa475e8789a6` |
| `SubTrack/apps/api/vitest.browser-subscription-read.config.ts` | `fea35324f7fd60ec50a627272eddbd38750a809e` |
| `SubTrack/tools/database/browser-subscription-read-proof.sh` | `50c66cd43ad40f968367cf7d1428c4c78cec17d3` |
| `SubTrack/.sdlc/evidence/ST-222/cleanup-negative-check.sh` | `73c735162e017b7375a566d9da4ef819d8b292dc` |

Focused validation: frozen pnpm install passed; launcher unit tests 13/13 passed with V8 statements 86.86%, branches 82.09%, functions 82.6%, lines 94.4%; API TypeScript typecheck and build compilation passed; focused ESLint and Bash syntax passed. Integration now launches two compiled child processes on the same loopback port, sends actual SIGTERM and SIGINT respectively, checks listener refusal and the owned runtime pool count against the parent-only `pg_stat_activity` baseline after each stop. Actual owned PostgreSQL/Chromium proof has not run locally and is a blocking CI gate. Independent corrected-source reviews and exact-head CI remain due.

Wrapper correction after frozen source security REQUEST_CHANGES: normal successful finish requires its private 0600 record to match the invocation's exact CID, label, name and creation time, then verifies exact Docker removal before PASS. A missing record explicitly returns failure in that path; separate `--cleanup` remains idempotent. Failed browser integration logs map only the six fixed generic test phases into a sanitized receipt subphase, defaulting to `unavailable`; no raw log line is copied. The first one-off harness reported PASS incorrectly; root's rerunnable `.sdlc/evidence/ST-222/cleanup-negative-check.sh` exposed the missing-record return-status bug on blob `9fd19a19e2870ba38ebebc4fce41defd58482b59` (exit 1). After the explicit-status correction, Git Bash syntax and that exact rerunnable check pass (exit 0, fixed PASS text). The workflow now runs the versioned negative check before the browser proof and triggers on changes to that check. Six source blobs from the original eight remain unchanged; the wrapper, workflow and ninth harness blob are frozen above. QA independently verified all eight pre-correction hashes before and after its full API run: 73 files, 1467 tests passed. Corrected source re-review and exact-head CI remain due.
