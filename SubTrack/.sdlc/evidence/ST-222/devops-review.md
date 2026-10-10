# ST-222 devops pre-freeze source review

contract: REVIEW/v1
task_id: ST-222
reviewer: devops-release
verdict: REQUEST_CHANGES (provisional; source unfrozen, actual CI absent)

Findings for `.github/workflows/subtrack-browser-subscription-read-proof.yml` and `tools/database/browser-subscription-read-proof.sh`:

- **Major — coverage provider is not in the API importer.** Wrapper lines 117–125 run API Vitest 4.1.11 with `--coverage`, but `apps/api/package.json` declares no `@vitest/coverage-v8`; the lockfile's compatible 4.1.11 provider belongs to `packages/money` and the UI provider is 5.0.3. Under isolated pnpm the API command needs a resolvable matching provider. Prove the exact frozen CI invocation or arrange an approved in-scope solution before claiming the >=80% gate.
- **Major — proof path filters miss prerequisites.** Workflow lines 5–13 trigger on API auth/subscription/database/prisma and proof files, but not `SubTrack/package.json`, `SubTrack/pnpm-lock.yaml`, `SubTrack/apps/api/package.json`, `SubTrack/packages/ui/package.json`, or accepted domain/contract sources used by the graph. A PR changing only a pinned browser/runtime dependency or upstream policy can avoid this proof. Include the actual transitive inputs so exact-head required proof runs when those inputs change.
- **Major — PASS receipt omits case proof.** Wrapper lines 53–56 write HEAD and coverage after cleanup, but no checked case identifiers/counts. Acceptance explicitly requires a sanitized receipt binding source head and fixture cases. Emit a fixed allowlisted case summary only after successful integration and verified cleanup; do not copy raw test output or credentials.
- **Major — pending-record absence is ambiguous on Docker errors.** In cleanup lines 19–22, any `docker inspect` failure while CID is `pending` is treated as nonexistence and removes the record. A Docker daemon/API failure can be indistinguishable from no such container, allowing an owned container to remain without its recovery record. Verify daemon reachability and exact named absence before deleting a pending record; otherwise retain it and fail cleanup.
- **Minor — cleanup verification is narrower than fixture identity.** Lines 26–28 check image, label, mount string and 5432 HostIp, but not creation time or sole port binding. Preserve the exact recorded creation/port facts for cleanup identity or explicitly prove that no extra binding/mount can be present before removal.

Positive provisional checks: PR checkout requests `pull_request.head.sha`, permission is `contents: read`, job timeout is 25 minutes, Node 22/pnpm 12.6.0/Playwright 1.63 are pinned by repository dependencies, Chromium installation is explicit, no browser proof is skipped, and the wrapper records a random pending name before `docker create`. Source review remains open until a frozen manifest and actual exact-head PostgreSQL/Chromium CI receipt.

## Final corrected-source review — 2026-10-10

contract: REVIEW/v1
task_id: ST-222
reviewer: devops-release
verdict: APPROVE_SOURCE (release gate remains NOT_READY until actual exact-head CI proof)

I verified the normalized `git hash-object` values of all eight workflow, package, lock, launcher, unit, integration, config and wrapper files against `source-manifest.md`. The final wrapper blob is `9fd19a19e2870ba38ebebc4fce41defd58482b59`; the other seven match their frozen entries. This supersedes the provisional source findings above while preserving their history.

- The API importer explicitly links `@vitest/coverage-v8` 4.1.11 to matching Vitest 4.1.11. The wrapper runs the launcher unit spec with all four 80% thresholds and checks the JSON summary before browser integration.
- The pull-request path filters include package, workspace and lock sources; API config, auth, subscription, database and Prisma sources; accepted domain/contract/config inputs; and the proof files. Checkout selects the PR head SHA, and the sanitized receipt prints the checked-out `git rev-parse HEAD` plus fixed case identifiers only after successful integration and verified cleanup.
- A pending ownership record is written before `docker create`. Pending-record cleanup requires a reachable Docker daemon and exact named absence before removing the record. Existing-container cleanup verifies CID, random task label, name, creation time when recorded, image, sole tmpfs mount and sole loopback port binding before exact CID removal; it retains the record on Docker errors.
- The post-freeze correction closes the missing-record PASS gap: normal successful finish requires a private 0600 record matching this invocation's CID, label, name and creation time, then verifies exact container removal. Missing or substituted records fail the proof. Standalone `--cleanup` remains idempotent for an absent record. Failed integration maps only fixed generic test phases into the receipt; no raw test log is copied.

Author-reported focused build, typecheck, lint, Bash syntax and 13 launcher unit tests passed with runtime V8 coverage above 80% on all four dimensions. QA-reported full API regression passed (73 files, 1467 tests). I did not rerun those commands in this source audit. The actual owned PostgreSQL 16, compiled Node HTTPS and Chromium proof has not run; the exact-head GitHub Actions run and sanitized PASS receipt remain blocking, as do the other independent final reviews and required checks. This source approval is not a release or merge approval.

## Rerun after cleanup-status regression — 2026-10-10

contract: REVIEW/v1
task_id: ST-222
reviewer: devops-release
verdict: APPROVE_SOURCE (corrected nine-blob freeze only; exact-head CI still blocking)

The preceding `9fd19a19e2870ba38ebebc4fce41defd58482b59` approval was premature and is withdrawn. Root's rerunnable negative check showed that its compact missing-record branch could return a successful shell status despite the intended condition, allowing a false PASS. The frozen wrapper now uses explicit `return 1` for the missing record when normal successful finish passes four exact invocation fields, while no-argument `--cleanup` explicitly returns 0 for an absent record.

I independently verified all nine normalized `git hash-object` values against `source-manifest.md`: workflow `24259806a74090e505774375f6fb30f91d77a480`, wrapper `50c66cd43ad40f968367cf7d1428c4c78cec17d3`, negative check `73c735162e017b7375a566d9da4ef819d8b292dc`, and the six unchanged source blobs. The workflow runs the versioned missing-record negative check before Chromium installation and includes that check in the pull-request path filter. The remaining workflow, package, lock, case receipt, pending-record daemon check and exact-container cleanup findings remain resolved as reviewed above.

I ran the frozen negative check independently under Git Bash; it exited 0 with `ST-222 missing-record PASS denial and standalone cleanup idempotency: PASS`. Git Bash syntax checks for the wrapper and check also exited 0. This is source readiness only. The actual owned PostgreSQL 16/compiled Node/Chromium integration, exact-head PASS receipt, independent required reviews and other blocking CI checks remain outstanding; no release or merge approval is implied.

## CI failure-classifier correction review — 2026-10-10

contract: REVIEW/v1
task_id: ST-222
reviewer: devops-release
verdict: APPROVE_SOURCE (classifier correction only; owned browser proof still FAIL)

CI run `38085690411` failed in `browser-integration` with sanitized `subphase=unavailable`. The private log was destroyed by cleanup, so that receipt does not establish the underlying failure. The preceding approval covered the prior freeze; it does not apply to the two corrected blobs reviewed here.

I verified all nine normalized `git hash-object` values against the updated manifest. The wrapper is `4cf40d3cafa28d880219eec5979f0af1f6c92637`, the negative check is `204a65a75e0c6901a471fb5682bc598c29b59b94`, and the other seven blobs are unchanged. The classifier now finds fixed phase markers anywhere within a Vitest output line, including lines with ANSI suffixes, maps parent cleanup and collection failures to fixed categories, and falls back to `unavailable`. It writes only one allowlisted category to the receipt; it does not copy raw test output. The missing-record fail-closed behavior remains in the wrapper.

I ran Git Bash syntax checks for both scripts and the updated rerunnable negative check. Both exited 0; the check printed `ST-222 missing-record cleanup and sanitized failure classification: PASS`, covering ANSI-decorated phase text, collection and unknown fallback, plus the missing-record denial. This approves the classifier source correction only. The underlying browser integration failure remains unresolved until a new exact-head owned PostgreSQL/compiled Node/Chromium CI run produces a passing sanitized receipt; other required reviews and checks remain blocking.
