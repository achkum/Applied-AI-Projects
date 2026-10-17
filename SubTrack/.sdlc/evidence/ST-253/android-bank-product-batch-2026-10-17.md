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

Only the sixteen named synthetic PNG screenshots and closed `st253-installed-sandbox-android-v1` receipt are uploadable. Its twenty-one booleans are set only after corresponding actual stages exit successfully; signed source/SHA/release/verification/package/version/certificate bindings are recorded. It explicitly declares `backendSqlProofClaimed: false` and readback `authoritative-app-refresh-and-cold-restart`; independent real PostgreSQL durable proof remains the separate database gate. Private APK, raw Maestro output, logs and workspace are removed before acceptance, with emulator cleanup before artifact upload.

Primary Maestro syntax references reviewed 2026-10-17: [parameters via explicit -e](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/parameters-and-constants), [selected state](https://docs.maestro.dev/reference/selectors/state-selectors), [core selectors](https://docs.maestro.dev/reference/selectors/core-selectors), [scrollUntilVisible](https://docs.maestro.dev/reference/commands-available/scrolluntilvisible), and [test artifact directory](https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts). Arbitrary shell labels are passed using documented `-e`, not assumed automatic environment imports.

Targeted verification after final source review: existing private bank/detection four-file regression 46/46 passed, preserving original default BOOKED/DEBIT rejection tests with sandbox-only mixed-record opt-in and new positive pending/refund read/write test. Installed-workflow contract four tests passed. Detection UI suite passed after Why? expansion and outcome scrolling changes. Actual signed Android screenshots and receipt are not yet produced and must not be inferred from these source checks.
