# Android CI latency investigation — measured, 2026-10-17

The founder requests faster Android CI/builds and questions rerunning every suite on each fix. One agent only; no new runners/accounts/services/spending. This investigation must not restart the frozen phone-fix candidate57fba76e or change its APK source after validation.

## Actual previous successful timings

GitHub job metadata and already-retained phase logs, not estimates:

| Step | Duration | Evidence |
| --- | --- | --- |
| Entire installed Android proof |22m52s|39014849663/job117344738132|
| Pinned dependencies and all proof prerequisites |44s|same job|
| SDK setup |56s|same job|
| Existing debug Gradle cache restore (hit) |21s|same job|
| Emulator boot |41s|same job|
| Native build/install/start, phase native-build to flow-identifier |5m11s|07:50:19–07:55:30 UTC retained original phase log|
| Installed flows through final backend readback |about13m9s|07:55:30–08:08:39 UTC; includes all unrelated bank/edit/month scenarios|
| Runtime-enabled unsigned release/draft job |10m11s|39016353986/job117349162985|
| Actual build plus authenticated draft transfer/cleanup within that job |8m8s|same job step; not all compilation|
| Signed verification entire job |27s|39017822447/job117353435017|

SDK setup and signature verification are not the principal bottlenecks. Debug library caching already works; do not claim that there was no cache. App/source/context changes still compile and final runtime Release is a separate build. The pre-release debug full proof and runtime Release use different configurations; reusing their APK bytes as if identical would be wrong.

## Concrete low-risk changes prepared separately

1. Native concurrency key currently includes SHA, defeating cancellation between successive commits. Group disposable proof by PR number or branch; keep cancel-in-progress true. Actual manual signing/delivery has run/attempt-specific custody and must remain uncancellable.
2. Release currently has neither restore/save Gradle steps nor --build-cache. Reuse the existing reviewed init script that excludes every application task output, with narrow public dependency/transforms/wrapper/library cache paths and an exact lockfile/toolchain key. No APK, application output, configuration cache, fixture, credential, signing key or private log enters shared cache. Read/write only APK compilation modes; signed verification/tools-only have no compilation cache.
3. Local source-flow consumer checks should run before pushing any changed Maestro flow. They take about15s here and catch stale whole-file command-count assertions; preserve the original pre-Add navigation assertion and separately assert the new preferences revisit. No diagnostic/privacy classification broadened.

Focused local cache/concurrency tests and existing Android receipt/pipeline boundary tests pass (13 receipt/cache tests plus pipeline check). These are correctness checks, not a measured warm Release improvement. No speedup percentage is claimed until a genuine cache-hit build is timed.

## Highest-value next structural change: truthful scoped proof

For narrow Welcome/profile/UI corrections, run affected components plus actual installed signup/profile/avatar/preferences/login/restart and durable backend readback. Emit a separate scoped result; do not fabricate bank/edit/month booleans or publish the full-suite receipt. Preserve full regression for shared auth/session/API/Money/policy/native configuration and release qualification. Keep original full default until scope detection and result consumers are tested together.

A filename filter alone is insufficient: NativePersonalScreen currently combines profile setup, manual subscription editing/status, preferences and navigation. A change in that file cannot automatically be called profile-only. Split owned entry/profile presentation or use an explicitly reviewed scope before automating narrow selection. Catalog diffs also require key-level scope, not a blanket packages/** exclusion. The full branch/release gate must not become a false green or missing required check.

Dependency-path filters can avoid API/image/browser rebuilds for mobile-only catalog changes, but shared package/API changes still require their own checks. These filters and a scoped receipt need a separate bounded contract, not a silent gate deletion while handing off V4.

References checked 2026-10-17: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency ; https://github.com/gradle/actions/blob/main/docs/setup-gradle.md ; https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching . No new third-party action is introduced; current pinned GitHub cache action and existing exclusion script are reused.
