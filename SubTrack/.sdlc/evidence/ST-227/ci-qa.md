QA/v2; verdict=PASS; PR258 head=fda75b24a02b37842ae102e498395d2b89846ddd; run=38098447207.
All 13 frozen pins match candidate ab616ceb26e065263e071f4d69af666c822c869f and accepted main 238f5491b04e21b9e933388539ca33d97dfec8b3; 12 runtime/workflow pins also match current head.
Frozen OpenAPI pin matches candidate/accepted main; current OpenAPI blob 26c1de72cca1fd0da1ff93a25e41016e8db83577 matches PR base and includes accepted additive ST229 contract changes.
Independently confirmed seven allowed writer pairs and 21 denied pairs (28 total); no runtime implementation or lifecycle-proof claim.
PR diff is 119 changed nongenerated lines against base 7f5b5e392a4bd70f5b1f9be24d3d8a8025a2f8c1 (cap 180).
Exact-head quality gates PASS, including lint, typecheck, tests, visuals, ML, i18n, full Gitleaks scan and license check; ST-004 Compose runtime proof PASS.
PR status contexts: both required workflow jobs PASS; unrelated Vercel breast-cancer-detector/cutok statuses are failed by build-rate-limit and no required checks are reported.
Source-pin/matrix QA only; CI results do not establish new natural-browser, actual-write rollback, signup, UI, or account-readiness behavior.
