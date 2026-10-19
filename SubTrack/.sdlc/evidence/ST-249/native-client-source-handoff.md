# ST249 native detection client source handoff

2026-10-14 05:49 UTC. First-pass SOURCE READY for independent platform/privacy/client review. This is source qualification only: no installed Android/iOS or genuine ST249 PostgreSQL acceptance, feature merge, production policy, release, credentials, provider delivery or account creation is established.

The frozen native stream implements private direct HTTPS detection transport, a mounted personal inbox with explicit Scan / Confirm / Not a subscription / server-authorized compensating Undo, personal read-only detected badges and confirmed date-unknown detections outside Billing Month ribbons/totals. Existing Billing Month tokens, typography, vector icons and bilingual catalogs are reused. Manual edit/status behavior is preserved.

The transport validates exact wire bodies/results, closed conflict schemas, current profile/Just me prerequisites, private response headers, bounded payloads, cryptographic intent keys and abort/timeout behavior. No retry, durable receipt/key/candidate storage, provider client call, raw error logging or client-clock permission was added. Canonical minor-unit strings use BigInt and existing Money display.

Each mutation records sent intent before fetch inside real NativeSessionCore.run. Unknown errors, aborts and obsolete ignored-abort success throw inside Core.run and retire authority. Initial and every subsequent response/readback are generation/signal/phase fenced. Stale read-only blur cancellation is inert. External retirement synchronously hides private rendered state; blur/logout/unmount removes candidates and transient Undo. Known conflicts refresh current server state. If the fresh profile/mode gate becomes setup-required, inaccessible owner readback is suppressed rather than turning a known mode conflict into uncertain mutation failure.

Confirmation acknowledgement requires an ACTIVE DETECTED current-owner row with matching server revision and absence from inbox; Reject requires absence from active owner projection and inbox; Undo requires matching restored inbox revision and no ACTIVE owner row. Server receipt alone is insufficient. Immutable server deadline is displayed as information only, and Undo is submitted to the server even if the local clock suggests expiry. No replay extends a deadline.

## Actual focused validation

- Final mounted inbox: 31/31 tests PASS; 135/135 branch outcomes, 100% branch coverage. Includes scan/readback, confirm/reject/Undo, original past deadline, expiry/conflict/setup, duplicate and multi-page cursor cycles, racing double activation, ignored-abort mutation and owner readback, stale read blur, external Core logout retirement, remount/fresh verification, logout/revoke/storage failure and obsolete screen callbacks. Statements99.47%, functions96.87%, lines98%; the unexecuted convenience Refresh callback is not presented as 100% statement coverage.
- Detection API plus Billing Month projection: 21/21 tests PASS; both100% branch coverage, detection API100% all coverage metrics. Exercises exact bodies, runtime/token/key/gate/header/status/body failures, ignored abort/body abort/timeout, complete duplicate/cyclic owner pagination and exact beyond-safe-integer undated projection excluding all non-ACTIVE statuses.
- Existing Personal and Billing Month mounted suites PASS in the initial five-suite focused run. Those checks include detected read-only badge/navigation and authoritative disappearance of undated detections after refresh, preserving prior manual behavior.
- Mobile tsc --noEmit PASS after replacing test Array.at with compatible indexed access and root-owned contract Object.hasOwn compatibility correction. No compiler library widening.
- Focused11 native source/test/route files ESLint PASS; final changed inbox source/test two-file ESLint PASS again after setup guard correction.
- Actual packages/i18n/scripts/check-parity.mjs PASS: nested keys, shapes and ICU placeholders. Root i18n:check script does not exist; no fictional script success claimed.
- git diff --check PASS. No Git mutation, runtime/workflow/fixture/SQL edits by this author.

## Remaining gates

Independent source review must approve these exact bytes. ST249 genuine disposable PostgreSQL ordinary-role durability/isolation/concurrency/rollback/expiry/uncertainty plus installed Android/iOS scan/review/Undo/restart/private disappearance and durable backend readback remain required. Parent and bank installed gates remain blocking. Full ST081 Edit/Merge, production feedback/receipt retention/deletion, training/export and UF11 acceptance are not completed by this bounded development slice.

## Exact reviewed source roster and SHA256

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
