# ST-246 independent platform source review

Verdict: **GO for functional source**, against reviewed parent `bd04326`. This is a source review, not installed Android/iOS or owned-backend acceptance. I made no feature or test edits and did not rerun the author's checks.

The new route uses `NativeSession.run` and the existing Bearer `readNativeProfile`, `readNativeMode`, and owner-read cursor API. It withholds owner pages until the current profile is complete and mode is `just-me`, and withholds a successful agenda until terminal pagination. Duplicate IDs, repeated cursors, invalid owner projections/dates, and aborted traversals fail closed. The view renders only while session phase is active; a genuine current read failure reaches unchanged `NativeSessionCore.run` retirement. Blur/refresh invalidates the view's generation and aborts only its read controller; the resulting obsolete operation resolves without retiring a valid session. Logout clears rows immediately, and Core generation prevents old-authority publication. The personal list has a guarded entry and refetches on focus return.

Selection uses canonical civil `YYYY-MM-DD` validation and the device's local today through day + 29 inclusive, filters `ACTIVE` rows with explicit dates, then sorts by date and ID. No recurrence, aggregate, charge, provider, or concurrent-snapshot claim was added. Amounts use the existing `formatMinorUnits(BigInt(...), currency, {locale, display:'code'})` path. English and Swedish copy describes saved expectations. The diff and new files add no API, SQL, authentication, dependency, runtime, web, or SDK changes.

I inspected the source and relevant mounted/policy tests. The author's checkpoint reports selector 6/6 with 43/43 policy branches, mounted agenda and parent 32/32, focus/DST follow-ups, root layout 3/3, typecheck, scoped lint, and bilingual parity passing. Actual installed Android/iOS and owned-backend proof remain required by the task before acceptance.

Reviewed SHA-256 (verified independently):

- `apps/mobile/src/api/privateMobileRenewals.ts`: `3534F5C22720F1542678E13805466A653E4E84191492E8A1B2F3854F29512583`
- `apps/mobile/src/components/home/NativePersonalRenewalsScreen.tsx`: `E93FFA1BBA178F88D6AA7F54BDA4D9D6F1750FAE46979148E8341F1CDDD1B892`
- `apps/mobile/src/components/onboarding/NativePersonalScreen.tsx`: `159CFF19E7129558EBAAF801B68FF3F30B869E74CA2F90F17A3F94A62E01100C`
- `apps/mobile/app/_layout.tsx`: `F3362049926A3119152D21207C25049FDE4725C8C739114D4093BC25AEAC55DD`
- `apps/mobile/app/personal-home.tsx`: `8E8FA448361D9508413FE2383BC41554A2DF52332E9035BB1F293BC89D0461EC`

## Additive installed-runtime source review

Verdict: **GO for additive runtime source** under `runtime-plan.md`; this does not claim an installed pass. The original enrollment/Add, app and API restart digest equality, Edit/status through revision 6, tracking receipt, logout, and eight mandatory screenshots remain required. The Add journey enters one explicit date in its existing mutation; the original revision-2 Edit clears it. The added positive Home flow runs after original restart/logout and checks fresh verification, the original name/date/amount, refresh, and acknowledged logout. After the parent tracking/restart/logout sequence, the second Home flow checks the archived empty agenda, refresh, and acknowledged logout. Exactly two new screenshot names are accepted and required.

The fixture-owned observer is read-only under its existing repeatable-read owner transaction. It requires one MANUAL/SEK row with exact active name, amount, revision 1 and candidate date, then the same hashed row identity with ARCHIVED/revision 6/null date. Its final digest must match the existing tracking receipt. Only closed booleans/count/hashes reach success evidence; actual UI assertions, rather than the observer, establish device-local 30-day membership. No new API/SQL/grant, subscription, mutation, auth, dependency, or UX requirement appears in this runtime addition. The authored checkpoint reports focused helper and observer policy tests at 100%, API typecheck, scoped lint, syntax and YAML checks; I did not rerun them. Actual Android/iOS, database, pixels, and cleanup remain acceptance gates.

Runtime SHA-256 verified independently:

- `apps/mobile/scripts/private-runtime-renewals.mjs`: `4581A9B41C83B387125769A9AC86E6B7E91FBCDC44A6674B8FAA824A57558D24`
- `apps/mobile/scripts/private-runtime-device.mjs`: `F172AFBAA3419DD62CE0A822EA47480F3607C5180712DBA8896302ECC23C04AA`
- `apps/api/test/private-mobile-renewals-receipt.ts`: `7290B1401936EE41388216B2EB2F935EAC868F22AB6F46C1E97644316B997007`
- `apps/api/test/private-mobile-owned-fixture.ts`: `859A8A0DCB69D48BDFE2DAD5392803F92C8F1CA2230B0261CD9BB9334031D211`
- `apps/mobile/e2e/private-runtime-renewals.yaml`: `BC9C6A9040FE26FFC369595E4E5B9F480042BFCC9B5884DEF0BB41ACC4CAECB0`
- `apps/mobile/e2e/private-runtime-renewals-empty.yaml`: `86B4A8C625F8C562890A76B0DB0D20F3849264E47627B6E4743E397132D113A2`
