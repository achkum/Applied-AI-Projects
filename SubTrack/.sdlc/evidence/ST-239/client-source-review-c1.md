# ST-239 independent client/design/source QA — C1

2026-10-11. Accepted base `85f8134b9fd2a79ab572825766a7928171c9801e`; branch `st/ST-239-private-returning-login`. Original 18:18:06.654Z–22:18:06.654Z source attempt 1 remains in force. This is an independent static review of the frozen client files and natural browser driver. I authored no product source, tests, Git state, or actual proof. **Verdict: REQUEST CHANGES to browser proof capture/assertions; client implementation is otherwise source-acceptable subject to exact-head actual PG/browser/pixel QA.** This is not product acceptance or a claim that the browser suite ran.

## Findings

1. **[P1] Registered-subject alternate login screenshot is not the required state.** `apps/web/test/private-profile-browser.mjs:243-246` navigates to a fresh registration identifier screen, captures `login-instead`, and only checks the always-present link before enrolling Bob. No existing-subject response or `ENROLLMENT_LOGIN_REQUIRED` has happened. The fixed readiness matrix specifically requires the registered-subject stop and its usable alternate action in all four variants. Exercise a natural existing-subject enrollment collision, capture the resulting stop, and activate its login link. Keep the identifier screenshot as its own stage if useful. The product source at `registration-flow.tsx:331-338` does offer a link at the login-required state, but current proof does not exercise it.
2. **[P1] The requested successful-read screenshot stages are loading states.** `private-profile-browser.mjs:295-315` captures `login-profile-loading` while `/v2/me/profile/read` is held at the request route, and `login-mode-loading` while `/v2/me/mode/read` is held. These establish accessible progress, but cannot show a successful independent profile read or a complete-mode read as required by `client-qa-readiness.md`. The later `login-returned-list` screenshot and wire order assert the final list, not the two distinct completion stages. Add observable post-response capture points or equivalent visible confirmed states, then inspect pixels. Preserve the progress screenshots.
3. **[P2] The browser proof does not directly assert the returning owner's saved profile is unchanged.** Bob's editor is filled and saved at `private-profile-browser.mjs:267-269`; the next login only waits for the mode button at `:275` and checks read-path order. Alice's return similarly checks the path sequence and no profile/mode writes at `:320-328`, but not the returned profile fields or contact. Assert the returned persisted values from the login read and compare with the pre-login saved values; retain server-side nonmutation receipts for contact and mode. This prevents a regression that replaces one saved field from passing a merely complete-profile gate.

## Source assessment

The dedicated locale page mounts the shared flow with a fresh login entry; Welcome and the enrollment/login-required states expose links. The adapter sends only the finite fixture choice, decodes closed 200 proof and 201 web-session shapes, uses fresh nonce/idempotency and bounded fatal UTF-8 parsing, and holds proof/nonce only in async local scope. The flow installs volatile CSRF only after the 201 response, separately reads persisted profile then mode, and calls owner/read only after `profileComplete` and `mode === 'just-me'`. Incomplete profile and absent mode remain explicit user steps; the login path has no profile or mode write. Request-pending plus abort/generation checks prevent duplicate and stale UI advancement; uncertain session exchange clears private state and starts a new chain. Reload shows a fresh-login link. The browser driver retains all five accepted ST-238 case branches, adds natural Bob enrollment and empty-list isolation, checks Alice 50/51/detail/status and keyboard `Tab`/`Shift+Tab`/`:focus-visible`/Enter, checks verification 200 has no `Set-Cookie`, and simulates lost session response with one request and fresh recovery. Those are source observations only; actual execution and direct pixel review remain blocking.

The login adapter's 409 decoder checks exact keys, status and code but not the contract's exact title. This is a minor strict-decoder inconsistency (`apps/web/lib/login-api.ts:77-81`) and should be corrected with the proof changes. The response body is not cancelled on a bad media type (`:22-24`), unlike the enrollment adapter; cancel it to close the stream promptly. Neither issue by itself licenses a private-data display, because malformed outcomes stop the flow.

Author-reported verification: 17 web files / 139 tests PASS, web TypeScript PASS, `node --check apps/web/test/private-profile-browser.mjs` PASS. I did not rerun heavy tests or execute actual PG/browser. Required four-variant nonempty screenshots, pixel legibility/focus/localization, exact-head integration and CI are still open.

## SHA-256 custody of reviewed client files

```
ceedad86765e6f871f644c3ecf33930cffb32de2d9faffdb10a2ef6977ba2f06  apps/web/app/[locale]/welcome-screen.tsx
a20f4ebf0ba3dd366b3067a4ac44ca0427a177ec10f974510533c184fa399fee  apps/web/app/[locale]/login/page.tsx
135cf4408532e0101550f5e4013f486f02587554df8388ecefff8a586588b884  apps/web/components/onboarding/registration-flow.tsx
6401fd63da181c3af4faf0a57a83d3e218b113369fd5a5aeefccc3455c2ebf94  apps/web/components/onboarding/registration-flow.module.css
207f0593f267478d990e9e601c1c74e4310b7e3d8a38fe7cbaa0437a68ce6934  apps/web/lib/login-api.ts
13e9106652287310ccec87027d818b4406efae6c64d8b6746866bf76a8023d7c  apps/web/lib/registration-api.ts
66ae50bd5777ffd8f5e7955b1b2f61ddd3fee5ed875fa1a88a2481d111d8f289  apps/web/test/private-profile-browser.mjs
f1c0b855d821817d41491ea6025c8f4219948715ba95eef6528f56b41731bf64  apps/web/test/welcome-route.test.tsx
150a468b83b288a229c841ce6bda14eef211fac2e9c746ca854e9d8bc2b44429  apps/web/test/login-route.test.tsx
67b7e96377482cb5a7eba940c022fe5f4a412eb813be38a7840ac9573a44aad9  apps/web/test/registration-flow.test.tsx
a0aaf7258d8611df964d67c798698fb06b739b594dfd60033bb6af8c022470cc  apps/web/test/registration-api.test.ts
22caf267b487788c4d5d376310b4c041e69a5eadb7eac1397d2edc127fb90f33  apps/web/test/login-api.test.ts
b19e4aed318c87802a8890d3928b4527755accfd45e80e35cee8d64d7b43d27f  packages/i18n/catalogs/en.json
979882824a0543fd5eca0154883a58e96bb46f37c1d19cc9d8dc6335e1456e64  packages/i18n/catalogs/sv.json
```
