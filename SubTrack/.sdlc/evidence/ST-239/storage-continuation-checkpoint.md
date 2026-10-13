# ST-239 storage source1 continuation checkpoint

2026-10-11T18:53Z. Original attempt/source clock remains 2026-10-11T18:18:06.654Z to 22:18:06.654Z. Previous storage author reported 20+ calls; this continuation used approximately 18 tool calls over 9 minutes, including reads, edits and static checks. No source reset or actual PostgreSQL claim.

## Implemented

- Existing SQL012 Type 2a owner-row lock and cascading expired login-proof FK remain unchanged. SQL001–011 remain untouched.
- Launcher `LOGIN_IDENTITY_LOCK` now compares every non-owner `public.identity` table and column ACL entry against the accepted grant roster. It compares the complete nine-policy identity RLS roster, the dual owner-GUC expression, RLS setting, and nonce FK cascade. Injected `UPDATE(email)` and an extra permissive identity policy have startup-refusal steps in the shell.
- Login shell requires the natural second-owner browser marker and lost-response fresh-recovery marker. Final database assertions distinguish natural Alice, natural Bob and the accepted foreign subscription fixture; Bob has persisted complete profile, explicit Just me mode and zero subscriptions.
- Qualified login PG source now probes separate producer/runtime function execute boundaries, concurrent one-use redemption, known rollback/no session residue and later valid recovery, cross-binding/origin denial, deleted natural Bob issue and consume denial with fixture restoration, plus earlier natural Alice, one-use, original-nonce, cross-purpose, unknown-COMMIT and expired-nonce cascade cases.

## Verification and unresolved gates

`node --check apps/web/private-https-server.mjs`, Node type-strip syntax check of the PG integration, and `git diff --check` passed. Local Windows has no Bash, Docker or installed `esbuild` in the current checkout; a bundle parse attempt failed solely with `MODULE_NOT_FOUND: esbuild`. No qualified PG16, browser, pixels, startup refusal, or CI result is claimed. Shell timeout for the expanded PG sidecar is 75 seconds. Independent security re-review of changed exact source and actual qualified evidence are still blocking.

The source assertion still needs execution on qualified PG16 to confirm PostgreSQL deparses the frozen owner-GUC policy as anticipated. The new PG cases also need execution and any resulting defect repair. Original deadline and cumulative author counters must be carried forward.
