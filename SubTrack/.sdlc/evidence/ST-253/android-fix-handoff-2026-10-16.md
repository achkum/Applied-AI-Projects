# Android fix — founder-requested handoff, 2026-10-16

Development stopped for transfer to a new session. One agent only; no subagents or orchestration. Hourly automation `subtrack-hourly-development-progress` is paused. The issue list is recorded in `.sdlc/backlog.yaml` under `android_fix_handoff`, linked to existing tasks rather than duplicate tickets.

## Verified V4 candidate delivered — 2026-10-17

Actual Release build39022765026/job117367701691 PASS and independent signed verification39023804762/job117370716252 PASS at d2709cedb6d7d5cf8ddc05775ea321ceb47be7f1. VersionCode4, se.subtrack.app.sandbox, runtime true, release/nondebuggable, no private CA; original certificate, actual signature/zip alignment and signed/unsigned config/Hermes identities verified. SourceM remains immutable. Desktop signing execution443d7774, retained tools/backup/key and backend data preserved. Exact signed-return draft415726304 private/unpublished. Local APK65512945 bytes, SHA2561af7ab91f190d526341ea52756b433bc16d045893869ba3f6c183809896ca4fd verified again after authenticated asset download.

User file delivered: C:/Users/achku/Downloads/SubTrack-Android-v4-20261017.apk, with sibling verification JSON. Install over existing app; never identify the public gateway V2 or failed phone V3 as this correction. Founder actual signed-phone acceptance remains pending.

Broader full run39022386716/job117367319883 passes profile/avatar/preferences/Add/exact durable app/API restart, then its renewals test waits for native-personal-title/Manage while already on Upcoming. This was introduced by overly broad test-only viewport replacement, not established as an app failure. Restore original Upcoming row assertions, retaining only the necessary initial Manage scroll; add route-ownership regression. Ten focused scope/agenda cases pass. Test-only correction changes no APK/runtime source; full default path must be qualified separately and is not represented by the successful scoped receipt. No new app build is needed for this test repair.

## Latest CI-first correction — 2026-10-17

Supersedes the V3-ready disposition below: founder actual phone test FAILED. Profile arbitrary emoji text violated the eight-value contract before any API save; supported optional picker and field-specific errors now replace it. Initial setup omits language/theme; existing Manage persists both selected values via authoritative reread. Welcome is centred, Sandbox badges omitted and its sandbox Log in resumes directly. Source corrected and111 component/provider cases pass.

Founder explicitly reiterates CI/CD first. Scoped run39021165682/job117363095493 PASS at86a9035b6e7b3ebcaa84ee3c990cc613199540c4 in14m23s (prior full22m52s; observed8m29s shorter, not controlled benchmark). Original app/API restart/exact persisted row/logout retained. Six original PNGs inspected; actual dark theme persists after restart. Distinct scoped receipt never claims full bank/edit/month coverage. Runtime/product inputs are unchanged at final443d7774; only policy/tests/full-flow viewport guards/docs differ. Final PR quality and honest Release-policy check PASS; policy43s, no second PR APK compilation. New Release build uses public library-only cache; original application-output exclusion and all signer/custody gates remain.

PR295 merged normally without administrator override as d2709cedb6d7d5cf8ddc05775ea321ceb47be7f1; entire tree equals443d7774. One actual runtime-enabled V4 Release build39022765026 now in progress. No signed V4 acceptance/delivery yet. Current desktop signing execution remains443d7774c5147fa053f728eb0b93c13ceebd43ea until custody operations finish; retain original backup/key/tools and all backend data. Public gateway still V2; V3 is the phone-failed version, not a new fix. Full PR source443d7774 run39022386716 remains pending separately. User phone/signed-app and broader accessibility matrix remain open.

## Current disposition — 2026-10-17



This section supersedes the historical open-failure/resume instructions below. Do not restart SAVED_HEADER diagnostics or repeat unchanged suites.



- PR293 merged on the founder's explicit instruction: “just merge it. ill do check the actual app this time and provide feedback.” No independent human review is claimed. Merge/app source c975449a5875436fd5108d9c4fcb62c264f3f180 has the identical Git tree to installed tested d816fb19100607cb200dd1ee85d07534b087f9f9.

- Installed Android run39014849663/job117344738132 PASS: original full signup/profile/Just me/Add/Edit/status/revision6, app/API restarts, exact durable readbacks, Month/Upcoming, seven synthetic-bank flows and logout. Custom fonts measured; all18 original accepted PNGs inspected. Feedback1–3 concise copy, state-dependent exit controls, direct isolated sandbox signup/login and stable actionable Login target included.

- Runtime V3 unsigned build39016353986/job117349162985 PASS; retained original tools/key/DPAPI backup, signer certificate and backend data. Desktop execution cadd913f0c4cbadc2fcdc3c91d46b63ad6f4d320 repairs VoidTaskResult byte-array contamination without rebuilding APK. Sign and authenticated signed-return complete; private draft415677914 retains exactly two verified assets.

- Final signed verification39017822447/job117353435017 PASS: package se.subtrack.app.sandbox, versionCode3, runtimeEnabled true, release/nondebuggable, no private CA, original certificate, signature/zip alignment, embedded config and exact signed/unsigned Hermes match; temporary verifier custody removed.

- Signed APK: 65508849 bytes, SHA2564438be15b3f0bad696118a5185cf48484fd6451366be7f7d65b597544c04d293. Retained user file: C:/Users/achku/Documents/Applied AI/SubTrack/.codex-local-task-setup/deliverables/SubTrack-Android-v3-20261017.apk; sibling verification JSON. Private draft remains unpublished. Existing public gateway still serves V2 and is not the corrected artifact.

- Ready for the founder's requested actual-app test. Phone/signed-app acceptance and broader visual/accessibility matrix remain pending. No data reset, new signer, production/store release, iOS work or automation.




## Historical handoff (superseded)

## Resume here

- Outer checkout: `C:/Users/achku/.codex/worktrees/native-owner-search/SubTrack`; app root is its nested `SubTrack/` directory. Do not start in an unrelated checkout or pull/reset away this work.
- Local branch `codex/android-sandbox-updates`; remote PR branch `codex/native-owner-search`; PR293: https://github.com/achkum/Applied-AI-Projects/pull/293.
- Last tested/pushed source: `8493987f3e3e9262b9aec47a0d2bc47477d10811`. This handoff adds documentation afterward.
- Read app `AGENTS.md`, ST-253 task and governance before changes. Amend the existing task scope as needed for a concrete repair; do not create another planning/diagnostic ticket chain.

## Exact open failure

Installed Android run38927710444/job117063406161 failed after form entry and the Save tap: `SCROLL_UNTIL_VISIBLE`, target `personal-title`, occurrence `SAVED_HEADER`. **Creation success and durable readback are not proven.** The original first Manage navigation now passes.

Completed log already fetched once: outer `.codex-local-task-setup/native-8493987-android-private.log`. Do not fetch it again. Existing `manualSaveObservation()` provides closed arrivals/201/4xx/5xx/other/incomplete buckets; inspect its source and the actual create/readback/UI path to narrow this failure. No evidence yet establishes backend failure, route change or a scrolling-only defect.

The heading is always rendered in `apps/mobile/src/components/onboarding/NativePersonalScreen.tsx`. Manual create calls createNativeSubscription then rereadLoaded; success updates items, closes Add and sets saved/readbackUnavailable. Manual Save does not invoke onSetupComplete. Preserve all original flow assertions and durable data checks.

The ENTRY_HEADER encrypted frame is correctly ineligible at SAVED_HEADER; `METADATA_SHAPE` here is not a new screenshot defect. Do not broaden capture/privacy authority casually. Private recipient/key/artifacts remain ignored local material; never publish or commit them.

## Already resolved / do not repeat

- Actual owned-emulator boot succeeds after binding mutable startup config at completed boot.
- Android API34 Skia PNG sBIT parsing fixed; actual encrypted frame decrypted/viewed privately.
- That frame proved RN's private development warning notification covered bottom navigation. Latest source hides notification UI only inside the existing exact private localhost/development proof gate, preserving console/fatal errors. Latest installed run passes first Manage entry.
- Stable nav IDs are present. The stale blur/abort/session race was independently ruled out. No speculative session rewrite.
- Latest utility tests: six tests at 100% all coverage; 21 consumer tests, mobile typecheck and scoped lint pass; full integration-range secret scan passed. Do not repeat unchanged suites.

## Remaining delivery and constraints

No new APK has been delivered. Existing https://198.44.116.159/download/subtrack-sandbox.apk is old V2. Do not call it fixed. Preserve retained signer and backend data. Delivery workflow requires integration branch `st/native-synthetic-bank` and matching source SHA; do not bypass its authority or required review/CI. No delivery/build/signing action was started in this continuation.

Approved design: `docs/product/references/subtrack-billing-month.html` and `docs/product/BILLING_MONTH_ADOPTION.md`. Same production screens/navigation in sandbox; petrol/saffron, Geist/Bricolage, flat S logo, no sandbox-only pages. Visually inspect actual installed screens before handing over successor APK. Test signup/profile/Just me, add/read/edit/status, restart persistence and logout with actual durable readback; source/fixture proof is not completion.

Android only. No iOS/web/backlog expansion, spending, new accounts, real bank/OTP delivery, production/store release or OpenClaw. PR294 Bank work is separate and its manual EDIT cadence fix is not established as this first Save failure's cause.

At handoff, sole workflow watch was session67656 for run38927710444, private `native-8493987-watch-private.log`; Android completed failure, remaining iOS status not rechecked. Close/cancel obsolete observation if still active; do not start additional polling loops. No new test/build requested by this handoff.

The last estimate given was 60–90 minutes for a corrected APK, explicitly low confidence. It is an unfulfilled estimate, not evidence of delivery readiness. Re-estimate only after identifying the actual post-save failure.


## 2026-10-17 consolidated Android product successor

Founder supersedes the original single-agent instruction with three parallel feature authors, a three-hour target and one final delivery after implementation. Worktree remains native-owner-search; feature branch codex/android-product-completion includes PR296's test-only route repair. No iOS/web feature changes, real integrations, new accounts, spending, public/store release or OpenClaw software.

V4 phone acceptance failed: missing bank/detection access, family profiles and dedicated Insights/comparison plus category/date/calendar UI. Source now adds those shared native pages and actual Synthetic recurring ingestion/detection/review, additive owner-scoped household plans/users/planned payer, exact Money analytics and sample-price comparisons. Calendar/category controls and five prototype tabs replace the old three-tab/verbose form layout. The HTML is the visual reference; fictional score, Paid, market claims and settlement records are not treated as persisted facts. No full PRODUCT_SPEC completion claim.

Local checks: mobile/API typecheck and lint, exact recurring Money 100% coverage, changed contracts and bilingual parity, bank/detection original regression46, detection UI31, household19, NativePersonal46, sandbox read/projection38, calendar14 and affected native flow/source consumers pass. Original bank mixed-record default rejects remain; sandbox showcase alone opts into pending/refund ingestion. Contracts for final signed installed qualification and forward API upgrade are authored. Independent upgrade review caught/fixed UID1000 bootstrap readability, actual manifest byte binding and ambiguous-stop recovery; ten upgrade tests pass. Actual PostgreSQL/image and installed signed successor are still pending.

CI now selects a closed profile allowlist automatically; this broad feature batch intentionally selects full. PR API-image preparation is a source/config policy job; the separate same-image PostgreSQL gate retains real runtime proof. Final installed qualification consumes exact already-signed verified APK, with no second APK build. Preserve original V2 public APK/custody, existing signer/secrets/volumes and manual records. Upgrade tool appends successor receipts rather than rewriting original source/image custody.

Candidate merge, adult invitations/cross-account household sharing, settlements and genuine production provider authority remain outside the implemented bounded successor; do not report these complete. Current live API and V4 APK have not been changed by source implementation. Delivery remains blocked on real gates, retained image/API upgrade, TLS feature readback and final APK inspection.
