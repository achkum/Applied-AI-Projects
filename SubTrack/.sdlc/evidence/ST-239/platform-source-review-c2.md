# ST-239 independent platform source review C2

2026-10-11. Accepted base `85f8134b9fd2a79ab572825766a7928171c9801e`; original source1 attempt and 18:18:06.654Z–22:18:06.654Z clock remain in force. This is an independent, bounded static re-review of the C1 corrections in the uncommitted working source. I changed no product source or Git state and ran no tests, PostgreSQL, TLS browser, pixels, or CI.

## Verdict: APPROVE the inspected platform source boundary only

The C1 **major** request-digest omission is corrected. `witness()` obtains the resolved chain from `peek` and rejects a conflicting hint, then `requestH` HMACs the closed operation and strict body value(s), followed by that chain, canonical SHA-256 nonce digest, and canonical SHA-256 binding-cookie digest. `h()` length-frames every UTF-8 field. The verify call passes the validated Alice/Bob choice; the session call passes the validated login proof. The adjacent boundary unit captures the actual `reserve_login` request digest and separately changes proof, resolved chain, nonce and binding cookie; each changes the digest. This matches the frozen platform wire and needs no SQL signature change.

The C1 **minor** login-method problem mismatch is corrected. The private launcher selects `privateLoginProblem(res,400)` for wrong methods on exactly `/v2/auth/login/simulator/verify` and `/v2/auth/session`; that map emits `INVALID_LOGIN_REQUEST`. The neighboring HTTP unit checks the login 400 and 404 problem mapping, no-store and no cookie. The qualified private proof shell probes both wrong-method paths, the enrollment wrong-method path, and a nearby unmatched path, checks exact problem+json/no-store/no-cookie shapes, and requires zero reservation, nonce and login-proof rows before printing `PASS ST239_LOGIN_LAUNCHER_METHOD_MATRIX_NO_AUTH_SIDE_EFFECTS`. That receipt has **not** been observed in this review.

SQL012, the trusted verifier and PG integration file have the same bytes inspected in C1. The C1 static observations therefore carry forward: additive six-function SQL012; epoch/reservation/nonce/proof/live-owner lock order; lock-only Type 2a executor `UPDATE(id)` with dual owner-GUC RLS and `WITH CHECK(false)`; terminal-nonce FK `ON DELETE CASCADE`; no app/executor membership expansion; and one-transaction proof/nonce consumption, family/session/credential/current-CSRF insertion and owned burn. The launcher still pins the complete identity ACL and nine-policy roster. Existing SQL001–011 are absent from the working diff. These are source observations, not PostgreSQL results.

## Exact inspected SHA-256

| File | SHA-256 |
| --- | --- |
| `apps/api/prisma/development-auth/012-returning-login.sql` | `7cb4b871fd36c9115fc4bb9a0655d52822337ed8c2cfb9340b0758ef4c6d5802` |
| `apps/api/src/auth/login-v2/durable-development-login.ts` | `c265450c785884553d0790f00d0a4607f497789e64d205326cff553e941c2b3a` |
| `apps/api/src/auth/login-v2/durable-development-login.spec.ts` | `e4c40c89e6e298de585beb17275b5c07418b2f6680a3d3f8eb070660520d92e4` |
| `apps/api/src/auth/login-v2/private-login-http.ts` | `f2bfc7b6ee1d4e5260678c41108b6fc2280abdb52b17a31a1c17f0e14f611f27` |
| `apps/api/src/auth/login-v2/private-login-http.spec.ts` | `6bf94d7dff0e182083ac9c0453d58932e6813eb8eef66a8082e50428d8d15083` |
| `apps/api/src/auth/identity-provider/development-enrollment-person-verifier.ts` | `a1e8e3b8828e4b6c6e3f9b5578fecc068bba146dae14f2917f94774d1406e80b` |
| `apps/web/private-https-server.mjs` | `a9b7a338a389782fe9d167b7a522f4002de555b8de2a8ca6349d33747708f990` |
| `apps/api/test/durable-development-login.integration.ts` | `b202d8fa2e63c226495bfc9c465b562a0d463c3646dbe83d2f0e45b08e7efe3b` |
| `tools/database/private-profile-proof.sh` | `a3cf1675ff2a804bce0c00ae22c9732c95d8a49b6f0c2eff078e385ba583a38a` |

The API correction author reports focused 21/21 unit tests, TypeScript check, and measured combined login coverage of 90.9% statements, 85.04% branches, 100% functions and 97.23% lines. The launcher correction author reports `node --check` and diff check. These are author checkpoints, not independently rerun results here. This approval covers only the inspected source fence. Qualified PG16 catalog/ACL/RLS/row-lock/FK and transaction proof, actual TLS route matrix, natural two-owner browser and four-variant pixel proof, built-bundle/source pins, applicable CI and required reviews remain blocking for task/merge approval. Any source-byte change needs renewed exact review.
