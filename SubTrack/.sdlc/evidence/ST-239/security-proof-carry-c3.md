# ST-239 independent security proof-source carry C3

2026-10-11. Original source1/attempt1 and 18:18:06.654Z–22:18:06.654Z clock remain in force. This is a narrow static review of the latest browser, shell, and PG proof corrections. I made no product, SQL, API, browser-driver, shell, or Git changes and ran no qualified PG16, private HTTPS browser, pixel, or CI proof.

## Verdict: APPROVE the inspected proof-source delta only

The browser writes `CONTACT_SNAPSHOT_READY` only after natural Bob enrollment and independent profile/mode reads, then waits for `CONTACT_SNAPSHOT_CAPTURED` before Bob's first fresh login. The shell checks the three expected identity rows, hashes canonical JSON covering every `public.identity` column in stable id order into private owned temporary files, releases the browser, and compares the same digest after the browser login flows and before intentional PG fixture mutations. Contact values and digests are not printed in public receipts. The existing owned cleanup removes those temporary files. This is source evidence for a full-row nonmutation check; the runtime receipt remains unobserved.

The PG proof temporarily changes only natural Bob's existing trusted `external_id` to an unrelated 64-character digest. It requires the generic restart error and unchanged session, credential, CSRF, and login-proof counts, and restores the exact prior value in `finally` with a checked one-row update. The expiry proof expires the login proof while its terminal nonce is still live and checks denial and unchanged counts; only then does it expire the nonce, check another denial and unchanged counts, confirm both rows still exist, and exercise the existing prune/cascade assertion. No provider forgery or new identity authority is introduced by these tests.

The browser's response observer is attached to the initial and every replacement page. It records path/method/status only, checks private response no-store/Pragma and cookie attributes, and inspects intercepted verifier and deliberately lost session responses. The only parsed credential is the volatile CSRF kept in driver memory. `assertSafeWire` settles pending observer checks before private wire pass assertions. The final login marker is emitted after fresh recovery and those checks. The shell requires that marker and the new PG receipts before case success. Source and built-input custody, process/container/network cleanup, and the accepted five-case dispatch remain in place.

## Exact custody and earlier core carry

| Source | SHA-256 |
| --- | --- |
| `apps/web/test/private-profile-browser.mjs` | `44acec1fdcda1fb1cde6e77ff7cc53d1ae0c6b1ee153a56981400c8f5cea2015` |
| `tools/database/private-profile-proof.sh` | `0de26b3c2da7b8e80986920f7ec28820691c2fbf3fb02db02e1b5ceb07c4433c` |
| `apps/api/test/durable-development-login.integration.ts` | `6f43408112182dc1c60926ab5575697d42f712db6c787353e783abad4a6e4760` |
| `apps/api/prisma/development-auth/012-returning-login.sql` | `7cb4b871fd36c9115fc4bb9a0655d52822337ed8c2cfb9340b0758ef4c6d5802` |
| `apps/api/src/auth/login-v2/durable-development-login.ts` | `c265450c785884553d0790f00d0a4607f497789e64d205326cff553e941c2b3a` |
| `apps/api/src/auth/login-v2/private-login-http.ts` | `f2bfc7b6ee1d4e5260678c41108b6fc2280abdb52b17a31a1c17f0e14f611f27` |
| `apps/api/src/auth/identity-provider/development-enrollment-person-verifier.ts` | `a1e8e3b8828e4b6c6e3f9b5578fecc068bba146dae14f2917f94774d1406e80b` |
| `apps/web/private-https-server.mjs` | `a9b7a338a389782fe9d167b7a522f4002de555b8de2a8ca6349d33747708f990` |

The SQL012, durable login, HTTP, verifier, and launcher hashes exactly match the previously APPROVED security C2 and platform C2 source fence. Those source decisions carry without reopening the auth model. The PG integration and shell hashes changed solely for this proof correction and are approved only as inspected here.

Final shell increment: after the initial C3 inspection at shell hash `4320e6b6fe4213d9bbcaf1adca380cc4cf6d13f224eadbd11a7f695c8c553eda`, the author added a closed export of the three already required `ST239_BROWSER_*` PASS lines anchored to the selected locale/theme. Both existing structured FAIL exporters now accept `case=login` and the assigned closed login phase names, retaining their existing status and field enumerations. The export still emits no raw browser log, contact value, digest, cookie, or CSRF. It changes no assertion, runtime authority, or gate condition. I inspected that narrow increment and APPROVE final shell SHA-256 `0de26b3c2da7b8e80986920f7ec28820691c2fbf3fb02db02e1b5ceb07c4433c`; `git diff --check` passed for this file. The author checkpoint reports `bash -n` PASS; I did not rerun browser or PG execution.

Qualified PG16 catalog/ACL/RLS and transaction execution, the natural private HTTPS browser across all four locale/theme variants, direct pixels, exact committed-head/source/bundle custody, cleanup receipts, applicable CI, and remaining independent reviews are still blocking for task or merge approval. If any listed bytes change, recheck the affected source fence.
