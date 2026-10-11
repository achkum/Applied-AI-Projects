# ST-239 committed source custody fence C1

2026-10-11T19:20:17Z. Exact local head `51bfc1882d5ffb2508776fa0d50a6021c5dfa274`, accepted base `85f8134b9fd2a79ab572825766a7928171c9801e`. Independent static custody review; no product source, Git commit, PostgreSQL, browser, pixel, or CI mutation/execution by this reviewer.

**Verdict: APPROVE this exact committed source head for push and CI progression only.** This is not actual QA, product acceptance, or merge approval. The approved platform C2, security C2/C3, client C2 and proof QA C2 source boundaries carry only because their latest reviewed source bytes match the committed bytes after the sole CRLF-to-LF normalization described below.

I read `AGENTS.md`, `ST-239.md`, `CONSTITUTION.md` and the four review notes. For every one of the 23 latest source hashes recorded in platform C2, client C2, proof QA C2 and security proof C3, Node `execFileSync('git', ['show', 'HEAD:SubTrack/'+path], {encoding:'buffer'})` provided the committed bytes. Node read the checkout as `Buffer`; SHA-256 was calculated on raw bytes and on bytes with only CRLF replaced by LF. All 23 checkout and commit normalized digests match. All 23 reviewed digests match the raw reviewed checkout bytes. Thirteen files also match the commit byte for byte. The ten raw differences are exclusively line endings:

| Reviewed file | Preserved reviewed raw SHA-256 | Committed raw and both LF SHA-256 |
| --- | --- | --- |
| `apps/api/src/auth/identity-provider/development-enrollment-person-verifier.ts` | `a1e8e3b8828e4b6c6e3f9b5578fecc068bba146dae14f2917f94774d1406e80b` | `1653ce08000d699f5abd6cb61b513f14ef9f263902bd64022e741d48c2742f8f` |
| `apps/web/private-https-server.mjs` | `a9b7a338a389782fe9d167b7a522f4002de555b8de2a8ca6349d33747708f990` | `030d4b89c6dc1ff38528addbb6eabfe8a76011e27233e0b23cea63a51dd88886` |
| `tools/database/private-profile-proof.sh` | `0de26b3c2da7b8e80986920f7ec28820691c2fbf3fb02db02e1b5ceb07c4433c` | `04849642dfbd63902f9e43e0f4d9fe6a9ce07da304928b5afb78631972031bcf` |
| `apps/web/test/private-profile-browser.mjs` | `44acec1fdcda1fb1cde6e77ff7cc53d1ae0c6b1ee153a56981400c8f5cea2015` | `97d1b9b574897038aabcdd6501bf034deb0f07d26ef2f142ac84c3f9d27441cf` |
| `apps/web/app/[locale]/welcome-screen.tsx` | `ceedad86765e6f871f644c3ecf33930cffb32de2d9faffdb10a2ef6977ba2f06` | `16757caeb460c6408c11642d4ceb2b5b1dffa7f57999ed5788e86f0e2c58e24f` |
| `apps/web/components/onboarding/registration-flow.module.css` | `6401fd63da181c3af4faf0a57a83d3e218b113369fd5a5aeefccc3455c2ebf94` | `16ea9ec1967d74e4ef4bf92b55d255a105594fe43209d9a723721f32741b3f70` |
| `apps/web/lib/registration-api.ts` | `13e9106652287310ccec87027d818b4406efae6c64d8b6746866bf76a8023d7c` | `3b33a52efb5183fa011241db40de9429aabe6bfcb59d91af1ae5dff93c75be0b` |
| `apps/web/test/welcome-route.test.tsx` | `f1c0b855d821817d41491ea6025c8f4219948715ba95eef6528f56b41731bf64` | `fe5183f26938db118846c3570a29c5fd505e87ccc7502f834c6c3bf94cee9e5b` |
| `packages/i18n/catalogs/en.json` | `b19e4aed318c87802a8890d3928b4527755accfd45e80e35cee8d64d7b43d27f` | `2d9cce06a4d9cd27a8a8c033a0d99a5574613801e12369df90ae43c1f564e657` |
| `packages/i18n/catalogs/sv.json` | `979882824a0543fd5eca0154883a58e96bb46f37c1d19cc9d8dc6335e1456e64` | `354576d0c973a695b5d45c62a582c102df54bee29d2d71de62be13b0f6143b2a` |

The other thirteen matching raw digests are recorded by file in those latest review notes. The C3 shell hash supersedes proof QA C2's earlier shell hash; the C3 PG/browser hashes likewise supersede their earlier proof versions. No stale C1/C2 superseded hash was used as a gate.

The `contracts.test.mjs` committed delta against the accepted base is exactly one insertion, zero deletions: `['POST /v2/auth/login/simulator/verify', 'unavailable-default']` immediately following the enrollment simulator row. No other route expectation or test predicate changed. This matches the narrow `contract-inventory-correction.md` approval. The route itself is declared `x-runtime-availability: unavailable-default` in the contract; the standard contracts package 28/28 and fixture check are reported in `conductor-local-validation-c1.md`, not rerun here.

The task's approved source roster and 2,000–3,200 estimate / 3,500 source and 4,200 full nongenerated hard caps remain recorded in `ST-239.md`. Conductor's existing roster audit records 71 changed files, 2,410 source lines, 729 metadata lines, 3,139 nongenerated total and 227 generated lines; 185 downloaded ST-238 PNGs are outside that count. This review did not recompute the full line taxonomy. The generated artifact origin is the rostered OpenAPI `openapi-ts` regeneration recorded in `api-continuation-checkpoint.md`; the committed base diff shows only four generated paths (`index.ts`, `sdk.gen.ts`, `types.gen.ts`, `zod.gen.ts`) with 222 insertions and 5 deletions, equal to 227 changed lines. No old SQL001–011 or authority core source appears in the commit change list.

The checkout has unrelated untracked ST-238 downloaded artifact directories and this note remains uncommitted for the next accepted metadata step. There is no tracked post-head source diff. Qualified PG16 and natural private HTTPS browser proof, four-variant direct pixels, cleanup receipts, source/built-bundle runtime custody, applicable CI and required final reviews remain open and blocking for merge or completion.
