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
