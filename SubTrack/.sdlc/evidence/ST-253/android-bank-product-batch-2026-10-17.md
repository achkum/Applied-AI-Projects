# Android bank/detection product batch — source handoff

Implementation authored in the founder-authorized parallel feature batch. Tests are written but have not been run by the bank author. No push, CI dispatch, image/APK build, live migration, deployment, signing or release was performed.

## Implemented path

- Shared `/personal-bank` and `/personal-detections` routes select injected SandboxSession and sandboxMobileApi only for the explicit isolated build. Existing production adapters retain their original authority.
- Connect uses the existing durable bank core, SyntheticBankProvider and IngestionWorker, then automatically invokes the accepted bigint recurrence detector. Twelve fictional streams span eleven monthly categories/one annual schedule over two years. Groceries, one-off purchase, pending debit and refund inputs exercise exclusions. Aurora Video has a stable recent synthetic price increase within the detector's original ten-percent amount band.
- Candidates reach the actual durable inbox. Confirm/reject/ten-second Undo reuse existing revision, receipt, feedback and current-authority fences. Repeated sync/scan does not reset review decisions. The Bank screen exposes Review detected subscriptions after authoritative bank readback.
- Source-linked booked history is available through `bank-history`: latest 400, signed minor units, SEK, exact date and candidate attribution. The history endpoint remains owner-only; household membership supplies no transaction authority.
- Next expected dates are persisted from the latest attributed booked recurrence and cadence, permitting confirmed detected rows to appear in the existing Home date projection. These dates are forecasts and never establish payment.
- Explicit `subscription-edit`/`subscription-status` sandbox operations reuse the accepted strict request/result contracts and existing edit receipt/revision/lifecycle core. Exact sandbox-only SQL overrides permit confirmed detected rows; pending/rejected detections remain review-only. Production SQL remains manual-only.
- Household operations from the separate household author are composed into the same strict envelope, client and server dispatch; all statement parameters remain owner-first.

## Data and delivery preparation

Additive migration 003 creates isolated Synthetic bank/detection storage and extends existing subscription fields without deleting existing manual rows. Migration 004 is household-owned. Startup expects all four immutable checksums and 28 FORCE RLS tables. Original foundation/business hashes alone remain the capability-manifest basis so retained installations are not invalidated by additive schema checksums. Runtime image now copies both additional migrations and already builds/copies the existing domain/synthetic runtime outputs.

The explicit one-shot upgrade loader validates the existing isolated epoch/manifest and applied migration checksums, uses a session advisory lock and applies only missing 003/004. It neither resets the database nor generates material/changes runtime credentials. Default initial installation still refuses a pre-existing schema. See ADR 0038 for recovery/rollback boundaries; no live operation has been executed.

## Authored validation awaiting the consolidated batch

- Real Synthetic provider plus bigint detection regression over varied histories and exclusions.
- Strict bank/detection/household envelope, signed bank-history values/date/accessor validation.
- Isolated transport intent-key replay and response/conflict gates.
- Injected native Bank screen authority/readback and Review route.
- Configuration four-hash loading, preserved foundational manifest, finite authority and expanded startup roster.
- Upgrade migration planning with foreign/missing/reordered/tampered migration rejection.
- Existing owned PostgreSQL qualification now tests connect/sync/detection/review/undo, confirmed-row edit/lifecycle, replay stability, foreign bank/detection denial, household dependant/assignment readback, original same-database restart and expanded two-owner ordinary-role RLS checks. Original manual/auth/logout checks remain; the manual receipt count explicitly counts MANUAL source after real detected rows exist.

## Honest residuals

Installed combined UI and durable PostgreSQL results are pending. No candidate merge workflow is added by this batch; review supports confirm/reject/undo and confirmed plan editing. Real provider connections and external invitations are outside the founder's authorized test scope. This source handoff does not establish full product acceptance or a ready successor APK.


## Final signed-APK installed qualification source

Authored `.github/workflows/subtrack-sandbox-installed-android.yml` with explicit workflow dispatch inputs `source_head`, `signed_release_id`, `signed_sha256`, and `verification_run`. Only integrated `st/native-synthetic-bank` source is accepted. It requires an already successful `signed-return-verification` job at the identical source, exact authenticated private unpublished two-asset draft custody, runtime-enabled sandbox APK, versionCode greater than 4, and original certificate `10c659cae262ad807ae2da9a9c137b581c633ebef2ea3bce86bfe6c41052186c`. No native app rebuild, dependency installation, or private API fixture is performed. Actual final APK qualification remains pending; no run has been dispatched by this agent.

Five Maestro stages exercise fresh isolated enrollment/profile, household creation and member addition, synthetic bank ingestion/detection with two confirmations and reject/Undo, confirmed detected-plan editing with custom category/date/status, Home calendar and actual active-plan overview, Insights price increase/comparison, Swedish/dark saved preferences, cold-restart household/subscription readback, and logout. Detection review now scrolls to its actual outcome and time-limited Undo so lower cards do not hide the available action.

Only the nineteen named synthetic PNG screenshots and closed `st253-installed-sandbox-android-v1` receipt are uploadable. Its twenty-one booleans are set only after corresponding actual stages exit successfully; signed source/SHA/release/verification/package/version/certificate bindings are recorded. It explicitly declares `backendSqlProofClaimed: false` and readback `authoritative-app-refresh-and-cold-restart`; independent real PostgreSQL durable proof remains the separate database gate. Private APK, raw Maestro output, logs and workspace are removed before acceptance, with emulator cleanup before artifact upload.

Primary Maestro syntax references reviewed 2026-10-17: [parameters via explicit -e](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), [selected state](https://docs.maestro.dev/reference/selectors/state-selectors), [core selectors](https://docs.maestro.dev/reference/selectors/core-selectors), [scrollUntilVisible](https://docs.maestro.dev/reference/commands-available/scrolluntilvisible), and [test artifact directory](https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts). Arbitrary shell labels are passed using documented `-e`, not assumed automatic environment imports.

Targeted verification after final source review: existing private bank/detection four-file regression 46/46 passed, preserving original default BOOKED/DEBIT rejection tests with sandbox-only mixed-record opt-in and new positive pending/refund read/write test. Installed-workflow contract four tests passed. Detection UI suite passed after Why? expansion and outcome scrolling changes. Actual signed Android screenshots and receipt are not yet produced and must not be inferred from these source checks.


### Consolidated first CI and bounded corrections

PR297 first head9c71b5a9 failed before the APK build: a relative generated-type import silently widened emitting TypeScript's common source root, so the fixed expected API entrypoints were absent; new install-only script globals lacked explicit Node imports; the existing diagnostic source converter rejected the new calendar helper. These are corrected together. The API actual emitting build now creates both expected entrypoints, with strict runtime envelope validation and unchanged tsconfig/build guards; HTTP10/10 passes. Mobile full lint and signed-install contracts pass with explicit builtin imports. Metadata39/39 reaches its unchanged100% lines/branches/functions, retains all capture fences, and conservatively reports UNKNOWN after a real subflow; downstream affected source consumers59/59 pass. No diagnostic device run was repeated.

The source-only API upgrade tool also retains a private exclusive before-upgrade database custom archive and verifies its TOC before stopping the existing API. The receipt explicitly records restored:false; readability is not a demonstrated recovery restore. Independent source review accepted the bounded backup IO and unchanged resource graph; no live migration or backup has run.


### Guarded failed-screen diagnostics

The final signed-APK qualification also retains a diagnostic-only screenshot on a failed UI stage, never an accepted screenshot or success receipt. Before setup the driver explicitly clears only the freshly installed sandbox package on its owned disposable emulator; the setup flow launches without a second clear. A failure screenshot is eligible only after signed-install verification and that fresh workspace stage has begun. The owned-device check is repeated, and both resumed activity and current focused window must match `se.subtrack.app.sandbox` before and after the screenshot. An external/system foreground or missing/ambiguous window withholds capture. Only the original `failed-sandbox-product.png` and closed `st253-installed-sandbox-diagnostic-v1` receipt (diagnostic-only status, phase/source/signed hash/package/file/PNG hash/bytes) survive after private workspace deletion. Failure upload names only those two files, independently of the accepted artifact. Logs, tokens, UI XML and private APK remain unpublished and are removed. This guard/source test suite passes 5/5; actual signed execution remains pending.


### Native source 62e9 billing-month failure

Run39044091427/job117429308715 reached billing-month at15:30:04.89 after enrollment/save/restart/Upcoming passed and failed at15:30:07.38 with closed category `unclassified`; it retained zero artifacts. No current-screen or raw parse text was available, so timing alone does not establish the runtime exception. Source inspection found a deterministic incompatible parameter: `private-runtime-month-day.yaml` used `direction: ${MAESTRO_RIBBON_DIRECTION}`. The pinned [cli2.11 YamlScrollUntilVisible](https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-orchestra/src/main/java/maestro/orchestra/yaml/YamlScrollUntilVisible.kt) declares `direction: ScrollDirection`, while timeout/speed are strings; [command construction](https://github.com/mobile-dev-inc/Maestro/blob/cli-2.11.0/maestro-orchestra/src/main/java/maestro/orchestra/yaml/YamlFluentCommand.kt) copies that enum before script evaluation. Enum interpolation therefore cannot deserialize, consistent with the early failure. Callers now use literal DOWN before first ribbon selection, literal UP after positive refresh, and DOWN after empty-state refresh returns to the upper empty label. Shared helper retains only bounded LEFT traversal and exact date selection. A recursive actual-YAML enum regression covers both callers, helpers, affected enrollment/edit flows and all five final signed sandbox flows, and rejects the former parameterized form. Actual next Android run remains required acceptance; source diagnosis is not represented as observed UI proof.


### Consolidated second CI and final batch corrections

At pushed source62e9eff5, SubTrack quality gates and actual persistent PostgreSQL passed, including Synthetic ingestion/detection/review/edit and household owner isolation/restart. Android installed enrollment, Save with exact expected durable amount, API/app restart and Upcoming passed. It then stopped at flow-billing-month, 2.5 seconds after stage entry; the closed job provides no current screen. Source inspection found a concrete pinned-Maestro enum deserialization defect in its shared ribbon helper; that fix and its narrow regression are recorded below. No Android full acceptance is inferred.

The same-image PostgreSQL gate failed CONFIG/FILE because the qualification extraction loop copied only001/002 despite the actual image containing all four migrations. The bounded extraction loop now copies001–004; its regression checks actual copied bytes and rejects any missing SQL. API image contents/startup authority remain intact. The before-upgrade helper now parses frozen LIVE/VOLUME validator arguments inside their VM realm (the original plain-object checks rejected host-realm JSON), and verifies the separately retained original gateway executable through the frozen verifier before and throughout preservation checks. Upgrade tests15/15 pass; no live backup, migration or upgrade has yet run.

Home now presents the actual household name/date/profile avatar, compact period and member filters, hero amount, calendar/This week then Insights, following the approved HTML hierarchy. Member selection uses persisted explicit payer assignments and reprojects totals, categories, findings and calendar rows together; unknown payer rows are never assigned silently. Exact bigint hero digits and ISO currency have separate visual sizes while retaining the complete accessible amount. Combined Home/calendar/Insights component regressions26/26 pass.

The final signed installed qualification is callable through the already registered native workflow's explicit signed_product mode. Its source authority must match the integrated SHA; local reusable workflow syntax binds the child to the same commit. Normal PR/full selection remains intact. This avoids depending on publication of the newly authored workflow to main and avoids a second APK build. Final nineteen-screen installed capture, real TLS API readback, signing and successor delivery remain pending.


### Dense chart calendar selection contract

The final approved-reference correction replaces actual Home route day buttons with a dense month chart. The preceding horizontal-traversal repair is superseded: native month flows now open the real `native-home-calendar` date picker, wait/tap the exact `native-date-${MAESTRO_MONTH_ISO}` button, then require `native-month-selected-date` with the exact ISO date. The driver supplies that ISO directly from the persisted fixture renewal candidate, and both positive and archived-empty flows repeat exact selection after refresh. No selected state is inferred from an empty chart, and no repeat/swipe/absence fallback selects a date. All mutation, before/after readback and logout guards remain. Narrow source consumers pass46/46; actual installed execution remains pending.


Final HTML comparison additionally corrected the hero to left-aligned digits with the small unit/period beside it, compact member pills with native44-point targets, and the full31-day billing chart inside a surface card. Bar height uses bounded exact-money chart percentages within each currency, with separate labelled currency series; zero days are faint ticks. Pointer selection and the real accessible date picker both update the exact selected ISO date. Original large horizontal targets remain only in legacy component mode; actual production/sandbox routes use the shared overview. Full native proof selects the exact date through the picker before and after refresh. No payment/paid/delta value is invented from the illustrative HTML. Home/calendar/Insights26 tests, lint and types pass; final installed acceptance remains pending.
