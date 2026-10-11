# ST-239 independent client/design/source QA — C2

2026-10-11. Accepted base `85f8134b9fd2a79ab572825766a7928171c9801e`; original 18:18:06.654Z–22:18:06.654Z source attempt 1 remains in force. Independent static review of the frozen client and natural browser driver after C1 corrections. I authored no product source, tests, Git state, or actual proof. **Source verdict: APPROVE the client implementation and corrected browser-proof source for progression to actual qualified PG16/private HTTPS and four-variant direct pixel QA.** This is not product acceptance or a claim that the browser proof ran.

## C1 correction disposition

1. **Registered-subject stop: resolved.** `private-profile-browser.mjs:255-279` creates a new enrollment after Alice is registered, verifies Alice through the enrollment simulator, waits for `/v2/auth/enrollment/complete` 409, asserts the exact closed `ENROLLMENT_LOGIN_REQUIRED` body, waits for the stop text, captures `registered-subject-login-required`, clicks its localized fresh-login link, and asserts `/{locale}/login`. `registered-subject-identifier` remains a truthful separate screenshot. The link text is “Start fresh login” / “Starta ny inloggning” rather than the `logInInstead` catalog wording; the action and destination satisfy the required usable alternative.
2. **Successful profile/mode reads: resolved as post-response equivalents.** The route handlers in `private-profile-browser.mjs:354-387` preserve progress captures. Profile `route.fetch()` returns 200, its body is compared with Alice's saved profile, and is fulfilled before the next intercepted `/v2/me/mode/read` request captures `login-profile-read-mode-loading`. Mode `route.fetch()` returns 200, its body is compared with the saved mode, and is fulfilled before the owner-list request captures `login-mode-read-list-loading`. These filenames accurately describe the visible *next* loading stage; they are not images of profile/mode content. The source proves the prior successful read through response assertions and stage order. Actual capture timing and pixels remain mandatory.
3. **Persisted profile and mode: resolved.** Alice's saved complete profile and Just me mode are independently read before fresh login, compared to the intercepted login reads, and reread and compared after login (`:221-228`, `:370-409`). Bob's natural enrollment yields exact incomplete profile and null mode; both are compared to fresh-login reads, with no owner list or profile/mode write. After deliberate profile save, the exact saved profile and still-null mode are compared on another fresh login, again with no early list or login write (`:281-344`). Contact nonmutation is outside the browser profile projection and remains a required qualified-database receipt.
4. **Strict decoder details: resolved.** `login-api.ts:18-25,74-82` cancels an unexpected-media response body and requires the exact `Authentication unavailable` title for the closed 409 restart problem. `login-api.test.ts` covers changed title and stream cancellation.

## Remaining source assessment and proof boundary

The dedicated locale login page and Welcome link enter a fresh shared flow. Verification accepts only the finite Alice/Bob simulator choice and sends no client owner ID. The adapter uses fresh session nonce/idempotency, bounded fatal UTF-8, exact 200 proof and 201 session decoders, and in-memory proof/nonce. The flow installs volatile CSRF only after known 201; it reads persisted profile then mode under that authority, gates owner/read on complete profile and Just me, resumes an incomplete editor or explicit absent-mode choice without a login write, and clears private state at reload, stale/unknown response, or authority stop. The browser driver retains all five ST-238 cases (`profile`, `partial-terminal`, `empty`, `subscriptions`, `uncertainty`) and adds natural Bob isolation, Alice 50/51/detail/status, real Tab/Shift+Tab focus and Enter, lost session response with one request, and fresh recovery. New ST-239 PASS markers occur only after the new assertions.

The original page response listener checks cache and cookie headers (`private-profile-browser.mjs:107-129`). Replacement pages installed by `openFreshPage` record paths/status and 201 CSRF, but do not repeat that broad `safeWire` header check (`:230-246`). The corrected driver directly checks that the login verifier's 200 has no `Set-Cookie` (`:364-369`). Actual QA must inspect login/session/profile/mode response headers and cookie attributes on the replacement pages or retain equivalent qualified route receipts; the existing `safeWire` assertion alone does not cover those pages. This bounded proof caveat does not change the client source verdict.

Author-reported checks: full web 17 files / 139 tests PASS before the correction; focused decoder 1 file / 4 tests PASS, web TypeScript PASS, browser `node --check` PASS after correction; Conductor-reported Next build PASS after correction. I did not rerun heavy tests. Actual qualified PG16/private HTTPS browser execution, nonempty screenshots in all sv/en × light/dark variants, direct pixel legibility/focus/localization inspection, contact nonmutation receipt, exact-head source/build custody and applicable CI remain blocking before product approval.

## SHA-256 custody of reviewed client files

```text
ceedad86765e6f871f644c3ecf33930cffb32de2d9faffdb10a2ef6977ba2f06  apps/web/app/[locale]/welcome-screen.tsx
a20f4ebf0ba3dd366b3067a4ac44ca0427a177ec10f974510533c184fa399fee  apps/web/app/[locale]/login/page.tsx
135cf4408532e0101550f5e4013f486f02587554df8388ecefff8a586588b884  apps/web/components/onboarding/registration-flow.tsx
6401fd63da181c3af4faf0a57a83d3e218b113369fd5a5aeefccc3455c2ebf94  apps/web/components/onboarding/registration-flow.module.css
aca5f4d2a16e3520a3b57fb7ba122c9c88ac7342a4e5da2c9d8bc8395173db54  apps/web/lib/login-api.ts
13e9106652287310ccec87027d818b4406efae6c64d8b6746866bf76a8023d7c  apps/web/lib/registration-api.ts
120be8735cdd72323c90e955e9ab03fe3b42e628ea0b5db6b8ce3e4c67944d14  apps/web/test/private-profile-browser.mjs
f1c0b855d821817d41491ea6025c8f4219948715ba95eef6528f56b41731bf64  apps/web/test/welcome-route.test.tsx
150a468b83b288a229c841ce6bda14eef211fac2e9c746ca854e9d8bc2b44429  apps/web/test/login-route.test.tsx
67b7e96377482cb5a7eba940c022fe5f4a412eb813be38a7840ac9573a44aad9  apps/web/test/registration-flow.test.tsx
a0aaf7258d8611df964d67c798698fb06b739b594dfd60033bb6af8c022470cc  apps/web/test/registration-api.test.ts
bea7986e0aaf784baee148372135d4cb32c0e9d986ff5dcb879bd629b23eee4f  apps/web/test/login-api.test.ts
b19e4aed318c87802a8890d3928b4527755accfd45e80e35cee8d64d7b43d27f  packages/i18n/catalogs/en.json
979882824a0543fd5eca0154883a58e96bb46f37c1d19cc9d8dc6335e1456e64  packages/i18n/catalogs/sv.json
```
