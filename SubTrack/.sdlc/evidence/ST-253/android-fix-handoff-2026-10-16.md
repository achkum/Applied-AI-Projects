# Android fix — founder-requested handoff, 2026-10-16

Development stopped for transfer to a new session. One agent only; no subagents or orchestration. Hourly automation `subtrack-hourly-development-progress` is paused. The issue list is recorded in `.sdlc/backlog.yaml` under `android_fix_handoff`, linked to existing tasks rather than duplicate tickets.

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
