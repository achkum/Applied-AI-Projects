# ST250 native sandbox activation plan

2026-10-14. Plan only; inspected the current shared native-synthetic-bank checkout. No native source, runtime, signing, transfer, CI or deployment edits/actions. The guest identity model is already adopted; no new founder decision is proposed.

## Concrete change and exact ten-path freeze

Existing guest APIs, session core, entry/profile/manual screens, Renewals and Month projections are already wired into isolated sandbox routes. Four composition points deliberately block use: app.config.ts emits runtimeEnabled:false; resolveSandboxRuntime always returns null; the real sandboxMobileApi passes a hardcoded ios/empty marker; RootLayout mounts SandboxSessionProvider with its default available:false. Enable these points as one coherent slice rather than replacing working UI or authority logic.

1. SubTrack/apps/mobile/app.config.ts
2. SubTrack/apps/mobile/scripts/sandbox-app-config-test.mjs
3. SubTrack/apps/mobile/src/config/sandboxRuntime.ts
4. SubTrack/apps/mobile/src/config/sandboxRuntime.test.ts
5. SubTrack/apps/mobile/src/state/SandboxSession.tsx
6. SubTrack/apps/mobile/src/state/SandboxSession.test.tsx
7. SubTrack/apps/mobile/app/_layout.tsx
8. SubTrack/apps/mobile/src/providers/RootLayout.test.tsx
9. SubTrack/apps/mobile/src/api/sandboxMobileApi.ts
10. SubTrack/apps/mobile/src/api/sandboxMobileApi.test.ts

Do not edit SandboxSessionCore, secure storage, business contracts/backend, screen designs, private authority/enrollment, signing/build/transfer source or docs. Existing SandboxSessionCore tests remain prior evidence; repeat them only if concrete core behavior changes or a newly found integration failure requires it.

## Closed composition contract

Add build-only SUBTRACK_SANDBOX_RUNTIME_ENABLED with absent/false => preparation and exact true => active candidate; reject any other value and any presence on a nonsandbox variant. The existing SUBTRACK_APP_VARIANT=sandbox and exact SUBTRACK_SANDBOX_HTTPS_ORIGIN=https://198.44.116.159 remain mandatory. Existing private CA/enrollment/diagnostic contamination rejection and separate sandbox identifiers/plugins stay intact. PublicationEnabled and privateDiagnosticsEnabled stay false: activation enables isolated guest use, never store publication/private diagnostics.

Treat extra.subtrackSandbox as unknown at the trust boundary. Runtime accepts only the exact existing five own enumerable data fields (variant, apiBaseUrl, runtimeEnabled, publicationEnabled, privateDiagnosticsEnabled), approved literals, runtimeEnabled:true, and actual Platform.OS ios/android. Missing/extra/getter/inherited/prototype/symbol/wrong-type/noncanonical markers return null. No development exception, remote/client toggle, alternate origin, production endpoint or implicit private fallback. The preparation resolver keeps its disabled contract; add the active runtime type separately.

Use one shared pure marker validator in the real API composition and root provider availability. Both consume the actual Expo Constants marker and Platform.OS; remove the API's hardcoded ios/empty input. Provider initialization reads secure sandbox custody only when qualified availability is true. Correct sandboxBuildSelected within the existing provider/test roster: select the sandbox branch by actual marker property presence, including an own subtrackSandbox value undefined. Read config/extra/marker boundaries with bounded descriptors/property checks without invoking marker getters. Own undefined, null, accessor, inherited/hostile marker presence or access/inspection failure stays isolated as sandbox unavailable and never mounts NativeSessionProvider or EnrollmentProvider. Only a truly absent marker in an ordinarily inspectable configuration retains the existing private branch; default private behavior is unchanged in that case. The strict runtime validator independently returns null for malformed/hostile markers. Keep unsupported initial/later deep-link subtree rejection and the exact four allowed routes. Authentication/network/TLS/cache/parser/storage failures remain sandbox unavailable with no private request or trust bypass.

## Meaningful source acceptance

Actual locked Expo config loading proves absent/false builds still disabled, true sandbox emits the exact approved active marker, mixed private settings/unknown flags/nonsandbox enablement fail, and default private identifiers/config are unchanged. Strict runtime tests cover both real native platforms, disabled/malformed/hostile markers and canonical HTTPS isolation. Mounted root/provider tests prove a valid active marker initializes only sandbox custody, usable entry persists capability before active state, malformed/disabled markers do not touch secure sandbox storage/network, and private providers never mount under any marker presence. Add mounted own-undefined and accessor/hostile marker regressions: getters are not invoked, private NativeSessionProvider/EnrollmentProvider do not mount, and secure sandbox initialization/network remains untouched. Include a truly absent marker control proving the existing private branch still mounts. Existing deep-link isolation stays exercised.

Test the default exported sandboxMobileApi composition with mocked actual Constants/Platform/global fetch, rather than only its injectable factory: valid active Android and iOS use only the five /v2/sandbox/mobile routes; missing/malformed/disabled markers never fetch; ordinary/private tokens/endpoints remain rejected. Retain existing bounded transport, cancellation/current-generation persistence, duplicate/conflict parsing and no-store guards. Run only changed config/runtime/provider/API/mounted tests, scoped lint/types and relevant policy coverage after the exact freeze; units do not prove deployed TLS or installed native behavior.

## Execution prerequisites and honest artifact transition

Source implementation may proceed after independent platform/privacy plan review and exact roster freeze. Keep activation build flag absent by default. Before an active Release build or user-visible availability, root must verify the actually deployed qualified immutable API image/source/SQL tuple, persistent ordinary-role PG, same-database restart/two-owner/refresh/logout readback, trusted public-IP HTTPS with normal platform trust and no user CA/bypass. Source preparation can proceed alongside delivery; no unused preparation binary is relabelled active.

Android delivery owner controls a separate required artifact-contract amendment: current unsigned/signed schemaVersion1, transfer manifest, signed-pending/history and inspectors deliberately require runtimeEnabled:false. Preserve those preparation schemas. Define a separate active schema or explicit finite reviewed active variant, propagate measured runtimeEnabled:true from freshly generated Expo config/Hermes bytes through unsigned inspection, signed inspection and transfer/history, and bind sourceHead/origin/versionCode/hash/certificate to the exact new bytes. Never merely change receipt booleans or accept false bytes under an active label. Increment the new APK versionCode monotonically under the existing signer/history rules. Native author does not duplicate or edit those delivery paths. iOS likewise requires a fresh active build and separate accepted signing/install custody; existing unsigned simulator/Release success is preparation evidence.

Final native acceptance requires an actual installed Android and iOS build using trusted HTTPS: enter isolated guest workspace, complete profile and Just Me, add/edit/pause/resume a manual subscription, see server-backed list and Month/Renewals behavior, close/relaunch with durable readback, refresh/logout denial, and independent second-phone/workspace isolation. Capture bounded sanitized evidence and backend readback, never capabilities/tokens or private fixture rows. Route/deep-link rejection, unavailable/offline behavior and sandbox notice remain visible. Android/iOS signing, download hosting and installed-device execution remain separate reviewed gates; no store/production release, new account or cost is implied.
