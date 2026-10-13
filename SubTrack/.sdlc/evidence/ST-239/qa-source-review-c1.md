# ST-239 independent QA proof-source review C1

2026-10-11. Accepted base `85f8134b9fd2a79ab572825766a7928171c9801e`; original source attempt and deadline remain unchanged. I reviewed the uncommitted frozen browser, API unit, qualified PostgreSQL integration, proof shell, and CI workflow. I authored no product source, test, Git state, or runtime receipt. **Verdict: REQUEST CHANGES to proof source.** This is not actual PG16/browser/pixel approval.

## Blocking findings

1. **[P1] Login proof case cannot pass its own shell gate.** `tools/database/private-profile-proof.sh` unconditionally requires `PASS ST237_BROWSER_CASE case=$proof_case locale=... theme=...` after browser completion (line 364). The login branch in `apps/web/test/private-profile-browser.mjs` prints three `ST239_BROWSER_*` markers (lines 552–554), but no `ST237_BROWSER_CASE case=login` marker. The shell therefore exits before `durable-development-login.integration.ts` and the login database assertions, even when the natural browser path succeeds. Add the exact login case marker after all its assertions, or narrow the shell's common case check without weakening the three ST239 markers. Recheck exact source hashes and run the complete case.

2. **[P1] Contact nonmutation is asserted nowhere in the qualified login proof.** `client-correction-checkpoint.md` and `client-source-review-c2.md` assign this to the database proof because the browser profile projection does not expose contact. The login shell database block (lines 409–418) checks identity/profile counts, Bob's display/mode, and subscription isolation, but neither captures nor compares Alice/Bob's natural contact rows before and after fresh login. The API unit tests use an in-memory SQL fixture and cannot substitute for this qualified persisted assertion. Add a before/after contact assertion tied to the natural owner identities, without logging contact values.

## Proof coverage and limits

The browser source now naturally reaches Alice's registered-subject `ENROLLMENT_LOGIN_REQUIRED` 409 and activates its login link. It naturally enrolls Bob, checks incomplete profile and absent mode with independent reads and no early owner request, explicitly saves Bob's profile and mode, then proves Bob's empty list. Alice's saved profile/mode are compared before, during and after fresh login; her list, 50/51 pagination, Tab/Shift+Tab visible focus, Enter detail, legal status and readback are exercised. Reload and one lost session response lead to a fresh verified recovery. All five ST-238 case branches remain, and the workflow runs six cases for each sv/en × light/dark variant. These are source assertions, not observed results.

The replacement-page observer in `private-profile-browser.mjs` (lines 230–246) records response path/status and 201 CSRF but omits the first page's no-store and cookie-attribute checks. The verifier route handler separately asserts no `Set-Cookie` on its 200. Actual QA must inspect the replacement-page login/session/profile/mode response headers and cookie attributes, or the driver should enforce them. `safeWire` by itself covers the initial enrollment page only.

The new PG integration source checks producer/runtime function-role denials, owner row lock with forbidden UPDATE, one-use nonce/proof and cross-purpose redemption, a concurrent redemption race, known rollback without residue, cross-binding and cross-Origin denial, deleted owner at issue/consume, unknown terminal commit without replay, and expired nonce cascade. The shell has wrong-method/no-side-effect probes and startup refusal for broadened identity ACL/policy; it carries accepted source/build custody, catalog and cleanup gates. The new PG integration does **not** directly exercise missing registered subject on real PG, terminal redemption of an expired proof before pruning, or login-specific capacity/clock/epoch/pool-reset faults. Adjacent units cover absent/expired trusted verifier results and postcommit cleanup behavior; inherited foundation proofs cover some shared infrastructure, but their successful receipts should not be described as those new login-specific negative cases. Missing-subject and expiry are explicit ST-239 acceptance boundaries and need qualified negative assertions or a precise existing qualified assertion mapping before actual QA approval.

The browser uses post-response loading stages (`login-profile-read-mode-loading`, `login-mode-read-list-loading`) as visible equivalents of successful profile and mode reads. The HTTP bodies and order are asserted before those captures; pixel inspection still must confirm what the user sees. Unit-author reports of 21 login tests, API branch 85.04%/line 97.23%, API build, 139 prior client tests plus four focused decoder tests, web typecheck and Next build are not independently rerun results here.

## SHA-256 of inspected proof files

| File | SHA-256 |
| --- | --- |
| `apps/web/test/private-profile-browser.mjs` | `120be8735cdd72323c90e955e9ab03fe3b42e628ea0b5db6b8ce3e4c67944d14` |
| `apps/api/test/durable-development-login.integration.ts` | `b202d8fa2e63c226495bfc9c465b562a0d463c3646dbe83d2f0e45b08e7efe3b` |
| `tools/database/private-profile-proof.sh` | `a3cf1675ff2a804bce0c00ae22c9732c95d8a49b6f0c2eff078e385ba583a38a` |
| `apps/web/private-https-server.mjs` | `a9b7a338a389782fe9d167b7a522f4002de555b8de2a8ca6349d33747708f990` |
| `apps/web/lib/login-api.ts` | `aca5f4d2a16e3520a3b57fb7ba122c9c88ac7342a4e5da2c9d8bc8395173db54` |
| `apps/api/src/auth/login-v2/durable-development-login.spec.ts` | `e4c40c89e6e298de585beb17275b5c07418b2f6680a3d3f8eb070660520d92e4` |
| `apps/api/src/auth/login-v2/private-login-http.spec.ts` | `6bf94d7dff0e182083ac9c0453d58932e6813eb8eef66a8082e50428d8d15083` |
| `apps/web/test/login-api.test.ts` | `bea7986e0aaf784baee148372135d4cb32c0e9d986ff5dcb879bd629b23eee4f` |
| `apps/web/test/registration-flow.test.tsx` | `67b7e96377482cb5a7eba940c022fe5f4a412eb813be38a7840ac9573a44aad9` |
| `apps/api/test/vitest.durable-development-login.config.ts` | `4cad6a23292165544047784e60ddc45c2e4de86bd21cabb2e1640ef3ccf664b2` |
| `../.github/workflows/subtrack-private-https-profile-proof.yml` | `b60d08f571d0f34561632e2c9a5ee31fe8537f4cc4a00ffa570b8e7c45b817d8` |

All source files are uncommitted, so these hashes identify reviewed bytes only. Exact-head qualified PG16/TLS browser receipts, four-variant nonempty screenshots and direct pixel review, source/bundle pins, cleanup, applicable CI and final independent reviews remain required.
