# ST249 native detection client — independent privacy source review

2026-10-14. **SOURCE GO** for the exact native roster below. Reviewer was not the native implementation author. Read AGENTS, Constitution, ST249, ADR0016, native client implementation plan, platform plan review and final source handoff; inspected actual transport, mounted inbox, existing NativeSessionCore, personal/Month source, wire parsers, bilingual catalogs and meaningful tests. No code, Git, SQL, hosted/native execution or unchanged whole campaign performed by this review.

## Source findings

- Existing Core phase is `active` (its authenticated usable phase). Candidate cards, amounts, transient Undo receipt and scan/review controls are rendered only in that phase. Billing Month content and the modal visibility AND modal private children have the same direct phase gate. External authority retirement cannot leave private content waiting for an effect to clear it. Inbox blur/logout/unmount invalidates generation, aborts work and clears candidates, cursor history and receipt; fresh mount initializes existing Core to verification-required rather than restoring these objects.
- Detection transport uses the configured private HTTPS runtime, bounded Bearer grammar, credentials omit, redirect error and no-store request/response policy. Five routes use imported strict contracts; malformed/extra response fields, identity/status mismatch, unknown conflict, unauthorized/unavailable/server failures, decoding errors, timeout and ignored abort throw a generic private error. Exact four-code 409 parsing does not accept arbitrary problem bodies. No raw response/error logging, telemetry, new cache, durable candidate/receipt/key persistence or automatic mutation retry was added.
- Mutation intent is marked before mutation transport inside Core.run, after cryptographic key generation and an authority fence. Every response and following inbox/owner read is fenced for signal, mounted generation, focus and current active authority. The catch returns inert null only for an obsolete aborted read with no sent intent. A sent mutation cannot escape uncertainty as an obsolete success; it throws inside Core.run, which invalidates authority and requires fresh verification. Tests use the actual provider/Core and cover ignored-abort mutation AND subsequent owner readback, external retirement, racing double activation, logout failures and remount.
- Saved complete profile plus persisted Just me is reread before detection pages; mode/setup loss withholds private payload. Known conflict and Undo expiry refresh inside the Core callback; setup-required deliberately suppresses inaccessible owner projection rather than claiming acknowledgement. Duplicate candidate/owner identities and cursor cycles fail closed, including cycles across separately loaded inbox pages.
- Review result alone is insufficient. Confirmation requires matching candidate ID/current server revision on an ACTIVE DETECTED owner row plus inbox disappearance. Reject requires absence from the active owner projection and inbox. Undo requires the returned candidate ID and revision in the strict DETECTED inbox and absence of an ACTIVE owner row. Disagreement displays readback-unavailable and withholds success and Undo opportunity; it is not advertised as receipt-only success.
- Undo deadline is the original parsed immutable server timestamp, displayed informationally. No Date.now/client-clock authorization, countdown extension, automatic replay or restored receipt exists. Even a locally past deadline is submitted for current server authorization. Exact server expiry clears the opportunity after fresh authorized readback.
- Owner personal source adds read-only DETECTED badge/navigation; existing MANUAL/SEK/non-CUSTOM mutation guards remain. Month's new section includes only ACTIVE DETECTED null-date rows, reuses complete owner pagination and canonical bigint Money formatting, and is excluded from dated days and totals. No invented billing date or amount Number bridge was introduced. Swedish/English keys cover the new closed states, categories, cadence, reasons and informational deadline.

No blocking privacy source finding in these bytes. The reported focused test/coverage results are corroborating author validation, not an independently rerun campaign or installed acceptance claim.

## Exact SHA256 binding

| App-relative path | SHA256 |
| --- | --- |
| apps/mobile/src/api/privateMobileDetection.ts | 7a8bcfb23116f1c958dfe0bd10b5f2f9e236afd72e0b6b6e33f01e7c9cccd579 |
| apps/mobile/src/api/privateMobileDetection.test.ts | 8d1970aa6760ccc9709a82e23f121117b89e89cccbaf73d6c3d022ad3b2984ae |
| apps/mobile/src/api/privateMobileBillingMonth.ts | ed044fc7e1d116280874d00b76f950d3824aa2e61ff76b6001ab35bcd0527080 |
| apps/mobile/src/api/privateMobileBillingMonth.test.ts | 02da3de2cad8043d77a0788ddfeeb177f59764d4324c1b366b6320f789ee6906 |
| apps/mobile/src/components/detection/NativeDetectionInboxScreen.tsx | 3bad2910e79af67ede54b26a78d7d2dce189cd4d4b4490606ae3c48f795934a8 |
| apps/mobile/src/components/detection/NativeDetectionInboxScreen.test.tsx | 578f43e15e31f31eb38e02e699aa3bbb4bcdf71cdcd2b435f72037f8cf3b1c10 |
| apps/mobile/app/personal-detections.tsx | 7c6a903b86c93e2924dd3548612e5d95c09347530dc80ce03b17fa2bd3003669 |
| apps/mobile/src/components/onboarding/NativePersonalScreen.tsx | 5c3799b481d7d31bf1059747fc752d4a95a264f3b13d5e0f7c551a7c951118b5 |
| apps/mobile/src/components/onboarding/NativePersonalScreen.test.tsx | 7def282cc9e5ee413c83a2d01cfbe6437c718e046f772be2b48dba8d328e5ce2 |
| apps/mobile/src/components/billing/NativeBillingMonthScreen.tsx | b66ab042ed10905d355dc91da9237919f66acd7973483e7488cc0c36993afad9 |
| apps/mobile/src/components/billing/NativeBillingMonthScreen.test.tsx | 321def0d734e400c4f2ba467900aeff093cb53626807c1b87b2437c2f4833001 |
| packages/i18n/catalogs/en.json | 67b7fcc73479e48630b0955912f249ee57cf3817a3ffaebe050c302fad2f00ec |
| packages/i18n/catalogs/sv.json | ca425f5e59bfa019898c7d4c37b652201b96a247b839a8a1a51c15cb7e5eccd3 |

## Retained acceptance limits

This native source GO does not qualify backend bytes, genuine ST249 PostgreSQL operation/isolation/expiry/rollback/concurrency/uncertainty, or installed Android/iOS behavior. Those gates and durable readback/pixels/private disappearance/cleanup remain blocking, as do parent and bank installed acceptance. Full ST081 Edit/Merge/missed-charge behavior, production feedback/receipt retention and erasure, training/export and UF11 are not approved by this bounded disposable-development client review. No provider delivery, spending, account creation or production/public/store release is authorized.
