contract: REVIEW/v1; task_id: ST-212; reviewer: qa-engineer; verdict: FAIL_ACTUAL_PG_PROOF
PR240 head and dedicated run 38068700771 head: 49dc82dbe2da46a0f2462d9d3a54306a1580e0be.
Artifact st212-subscription-read-proof-793bced26ba8ac09171c254c8a77a1e52625b342 matches refs/pull/240/merge.
Actual run: migration/role setup reached Vitest; proof step failed, cleanup and artifact upload succeeded; run conclusion failure.
Sanitized CI log: FAIL phase=http-integration detail=canonical-synthetic-identity code=unavailable.
Downloaded receipt: FAIL phase=http-integration code=unavailable (EXIT trap replaced the narrower detail).
Source review: one HTTP test contains explicit owner/peer/DETECTED/share/open_book, cursor, bigint, spoofing, role/RLS and dual-GUC cleanup assertions; none are proven passed by this run.
Likely fixture defect: test inserts household in autocommit before first ADMIN member; canonical 0002 household_first_admin deferred trigger rejects commit without active admin.
Required repair: insert household and first ADMIN member in one owner transaction, then rerun exact-head dedicated proof and verify PASS only after owned cleanup.
No code or test edits made by QA; parent PR237 and unrelated Vercel red remain merge blockers.
Source re-review: integration blob ada15a9e655bdc1b33fcc72c51b3945ed30e4bc8; household and first ADMIN member now commit in one owner transaction, satisfying the deferred 0002 trigger.
Checked later fixture inserts/updates against canonical 0001 nonnull/FK and 0002 role, confidence, share and member lifecycle constraints; no further predictable setup violation found.
This closes source review only; actual PostgreSQL HTTP assertions and cleanup require a new exact-head CI receipt.
