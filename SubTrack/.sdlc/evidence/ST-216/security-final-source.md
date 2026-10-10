# ST-216 final security/privacy source review — 2026-10-10
Verdict: **HOLD pending cleanup receipt fix and actual CI/QA gate**. Source at commit `33f4ad8fc79449ef8b1351040cb1f0cb6fe851d7`; no source edits by reviewer. Normalized Git blob IDs follow (repository-relative):
| File | Blob |
| --- | --- |
| `apps/api/src/subscriptions/subscription-lifecycle.controller.ts` | `4aab3a3154ee953a7a925663dfedf58a148dd8b5` |
| `apps/api/src/subscriptions/subscription-lifecycle.controller.spec.ts` | `cabc09ff8c40a3c61c4866841a026ba1caa7c00e` |
| `apps/api/src/subscriptions/subscription-lifecycle.service.ts` | `955f6d00bfc55186f3acb7fd6d53235c40901613` |
| `apps/api/src/subscriptions/subscription-lifecycle.service.spec.ts` | `a212bd0ad424978d9c2bff3509757e09a0fc877f` |
| `apps/api/src/subscriptions/subscription-lifecycle.http-composition.ts` | `ef77e663687d0c4b9d54a204cf6ce22e32c3519a` |
| `apps/api/src/subscriptions/subscription-lifecycle.http-composition.spec.ts` | `0a1f3d69ccf227b22696f078302feb7935c8af54` |
| `apps/api/src/subscriptions/subscription-lifecycle.local.ts` | `d950c395c1cba9592ffda5c42190c6a7da33be1f` |
| `apps/api/src/subscriptions/subscription-lifecycle.local.spec.ts` | `541ca6c299e4add018d68288b0fb96b039f492ba` |
| `apps/api/test/subscription-lifecycle-http.integration.ts` | `82fba7bd1f22999dfc31cb7063e2c2249e1b97bf` |
| `apps/api/vitest.subscription-lifecycle-http.config.ts` | `b8e6d8224c969c63f2ff2e66db172e491f24ff11` |
| `tools/database/subscription-lifecycle-http-proof.sh` | `19e35420ba77e572a10fc62ec2bdf2bc4e004210` |
| `.github/workflows/subtrack-subscription-lifecycle-http-proof.yml` | `ffee78da6632b2d99a7447400888490ece4f8191` |
Finding: `finish()` can issue PASS after `passed=true` when `$record` is absent: `cleanup()` then returns success without verifying removal of the exact labelled CID. Require the record in normal finish; keep `--cleanup` idempotent. Root notified.
Earlier parser 500, error-code mismatch, and duplicate JSON findings are fixed at these blobs. Platform late-listen, geometry-negative, and pool-disconnect proof gaps are addressed in source. Route is confined to isolated loopback composition with APP_GUARD, real current-session reader, locked writer, raw query/body rejection, bounded problems and success. Direct entry checks exact private CID/label/image/tmpfs/port/full credential URL before Prisma.
Reviewed integration source covers seven pairs, visible peer write denial and identical hidden/missing 404, malformed/spoofed/revoked/wrong-subject requests, conflict/race, rollback/GUC, masked 500, compiled Node Bearer positive, provenance negatives, SIGINT/TERM listener and pool shutdown. Reported local focused 71 tests, full 1374, per-file runtime coverage ≥80%, ESLint and TypeScript PASS were not rerun by this reviewer. Actual PostgreSQL/Node22 CI, cleanup receipt, independent QA, and final-head gate remain unobserved; no merge/release approval here. ST-081 and UF-06 remain incomplete.
Fix re-review (working tree above `33f4ad8`): **conditional source approval**. The original HOLD is preserved above. Effective normalized blob manifest is the twelve entries above with wrapper replaced by `35fa659f674fc03bf43c73835d9cfc2b00a2e373` and workflow replaced by `12b81791bf5d4337c917bd8b63ce4fc12541529a`; other ten blobs are unchanged. Normal `finish()` now requires an existing nonsymlink record whose CID/label match this invocation before PASS, while `cleanup()` checks Docker label, removes that CID, and verifies absence; missing-record `--cleanup` remains idempotent. Workflow triggers now include auth, database, domain, package, and lockfile dependencies. Source condition is satisfied at these blobs. The prior 33f4ad8 actual-PG jobs reportedly succeeded, but fixed-head CI, independent QA, final-head checks and cleanup receipt must still pass before merge. No actual-PG run by this reviewer.
