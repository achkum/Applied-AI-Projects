# ST-216 final independent platform source review — 2026-10-10

Verdict: **CONDITIONAL SOURCE APPROVAL** at committed HEAD `33f4ad8fc79449ef8b1351040cb1f0cb6fe851d7` plus the uncommitted proof-wrapper/workflow blobs pinned below. The final commit, actual PostgreSQL/Node22 CI, independent QA/security final gate, and merge are still pending; this is not a CI or release PASS.

The three prior platform findings are addressed in source. `listenWithDeadline` schedules a second close when a timed-out listener settles late; controlled tests cover late listen/create/init. `assertOwnedFixture` negative tests cover CID, freshness, label, PG16 image, tmpfs mount, loopback binding, role/database/port/full URL and credentials. Actual-PG integration records the runtime role's `pg_stat_activity` baseline and requires it after both SIGTERM and SIGINT, alongside refused HTTP. Focused 71 tests, full API 1374 tests, API lint/typecheck, and ≥80% per changed runtime file are reported in the runtime handoff, not rerun here.

The security review's cleanup-record finding is fixed in the current wrapper: normal `finish()` requires the exact CID/label record when `passed=true`, and `cleanup()` verifies labelled-container removal; explicit `--cleanup` remains idempotent. The workflow now includes relevant auth/session, database, domain, and lockfile path filters. Conditional approval requires these exact wrapper/workflow blobs in the committed PR head and a successful actual-PG CI receipt at that head. Root must retain the separate required-check/relevance audit; this review does not waive any deployment or CI gate.

Normalized Git blob pins, repository-relative path order (first ten committed, last two current working-tree):

`apps/api/src/subscriptions/subscription-lifecycle.controller.ts` `4aab3a3154ee953a7a925663dfedf58a148dd8b5`; `apps/api/src/subscriptions/subscription-lifecycle.controller.spec.ts` `cabc09ff8c40a3c61c4866841a026ba1caa7c00e`; `apps/api/src/subscriptions/subscription-lifecycle.service.ts` `955f6d00bfc55186f3acb7fd6d53235c40901613`; `apps/api/src/subscriptions/subscription-lifecycle.service.spec.ts` `a212bd0ad424978d9c2bff3509757e09a0fc877f`.

`apps/api/src/subscriptions/subscription-lifecycle.http-composition.ts` `ef77e663687d0c4b9d54a204cf6ce22e32c3519a`; `apps/api/src/subscriptions/subscription-lifecycle.http-composition.spec.ts` `0a1f3d69ccf227b22696f078302feb7935c8af54`; `apps/api/src/subscriptions/subscription-lifecycle.local.ts` `d950c395c1cba9592ffda5c42190c6a7da33be1f`; `apps/api/src/subscriptions/subscription-lifecycle.local.spec.ts` `541ca6c299e4add018d68288b0fb96b039f492ba`.

`apps/api/test/subscription-lifecycle-http.integration.ts` `82fba7bd1f22999dfc31cb7063e2c2249e1b97bf`; `apps/api/vitest.subscription-lifecycle-http.config.ts` `b8e6d8224c969c63f2ff2e66db172e491f24ff11`; `tools/database/subscription-lifecycle-http-proof.sh` `35fa659f674fc03bf43c73835d9cfc2b00a2e373`; `.github/workflows/subtrack-subscription-lifecycle-http-proof.yml` `12b81791bf5d4337c917bd8b63ce4fc12541529a`.

The scope remains the isolated numeric-loopback development composition with accepted V1 principal guard/session reader, owner-only locked writer, seven status transitions, strict status-only input, bounded RFC9457 output, and no new auth provider, public route, persistent model, ordinary audit/replay, ST-081 or UF-06 completion claim.
