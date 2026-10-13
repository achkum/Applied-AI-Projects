# ST-239 independent security source review C2

2026-10-11. Accepted base `85f8134b9fd2a79ab572825766a7928171c9801e`, branch `st/ST-239-private-returning-login`. This is an independent static review of the uncommitted working source after the C1 corrections. I changed no product source, SQL, tests, or Git state and ran no qualified PostgreSQL, private HTTPS browser, pixels, or CI.

## Verdict: APPROVE the inspected source boundary only

The C1 security blocker is closed in the inspected launcher: `LOGIN_IDENTITY_LOCK` compares the complete `public.identity` table/column ACL to the exact accepted roster, including only executor `UPDATE(id)`, then compares all nine identity policies, their roles/commands/expressions, identity RLS flags, and the login-proof nonce FK cascade. The proof shell injects an extra executor `UPDATE(email)` and an extra permissive identity policy and requires startup refusal. These are executable assertions still awaiting qualified PG16; this source verdict does not assert they passed.

The platform C1 request-digest finding is closed: `requestH` length-frames the operation, strict body values, resolved browser chain, canonical nonce digest, and binding-cookie digest. The focused boundary test varies those fields. The two exact login paths now use `privateLoginProblem` for invalid methods, mapping 400 to `INVALID_LOGIN_REQUEST`; the shell checks both paths, no cookies and no auth rows. The closed simulator verifier accepts only the fixed Alice/Bob fixture choice. The provisioner subject lookup is a candidate; SQL independently rechecks a live matching owner under dual owner GUCs. No client UUID, claimed subject, provider result, or enrollment proof enters the login authority path.

SQL012 remains byte-identical to C1. The executor `UPDATE(id)` privilege supports owner-row locking only under both owner GUCs; its `FOR UPDATE` policy has `WITH CHECK(false)`. The login role has no executor membership or direct login-proof table grant. Producer and runtime have distinct fixed-function EXECUTE rosters. The proof FK cascades only on terminal nonce deletion; proof expiry cannot exceed its terminal nonce. Terminal consume checks the locked nonce, proof and live subject, then inserts family/session/credential/current CSRF, deletes proof/nonce and completes its owned burn in one transaction. API credentials return only after reported COMMIT and clean pool reset; unknown COMMIT discards the connection and credentials without replay. Existing SQL001–011 are unmodified in the working diff and remain pinned by the launcher.

The HTTP boundary requires exact loopback TLS/Host and Origin, unique closed headers/cookies, canonical binding and nonce, strict JSON, and no query/Bearer. Old session cookies are inert only on the exact session-purpose bootstrap and two login paths. The three session cookies and readable CSRF are emitted only after the durable session result. Current profile and mode are reread under new current authority before subscription disclosure; independent client review owns the corrected nonmutation and browser-state proof.

## Exact source custody

| Source | SHA-256 |
| --- | --- |
| `apps/api/prisma/development-auth/012-returning-login.sql` | `7cb4b871fd36c9115fc4bb9a0655d52822337ed8c2cfb9340b0758ef4c6d5802` |
| `apps/api/src/auth/login-v2/durable-development-login.ts` | `c265450c785884553d0790f00d0a4607f497789e64d205326cff553e941c2b3a` |
| `apps/api/src/auth/login-v2/private-login-http.ts` | `f2bfc7b6ee1d4e5260678c41108b6fc2280abdb52b17a31a1c17f0e14f611f27` |
| `apps/api/src/auth/identity-provider/development-enrollment-person-verifier.ts` | `a1e8e3b8828e4b6c6e3f9b5578fecc068bba146dae14f2917f94774d1406e80b` |
| `apps/web/private-https-server.mjs` | `a9b7a338a389782fe9d167b7a522f4002de555b8de2a8ca6349d33747708f990` |
| `apps/api/test/durable-development-login.integration.ts` | `b202d8fa2e63c226495bfc9c465b562a0d463c3646dbe83d2f0e45b08e7efe3b` |
| `tools/database/private-profile-proof.sh` | `a3cf1675ff2a804bce0c00ae22c9732c95d8a49b6f0c2eff078e385ba583a38a` |

The existing C1 static observations carry forward only for the unchanged SQL012 and verifier/integration bytes. This C2 verdict is not an exact committed-head review. Recheck hashes if source changes beyond adjacent unit coverage assertions.

## Unwaived gates

Qualified PG16 must execute SQL012 issuance/consumption and the negative grant/policy startup probes. In particular, PostgreSQL must confirm the executor's positive `SELECT ... FOR UPDATE` and denied `UPDATE id=id`, the exact nine-policy deparse and ACL projection, separate caller-role denials, nonce cascade, one-use race, rollback/unknown-commit, deleted owner, binding/Origin/cross-purpose, capacity/clock/epoch and pool-reset behavior. The current PG test source covers several of these cases but is not a result. Actual natural two-owner browser proof, saved profile/contact/mode nonmutation, all four locale/theme variants, direct pixels, source/built-bundle custody and applicable CI/reviews remain blocking for task and merge approval. If the qualified catalog gate rejects a legitimate PG16 deparse, fix and independently re-review the exact assertion; do not relax the access boundary to make it pass.
