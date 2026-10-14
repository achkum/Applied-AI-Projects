# ST-244 C11 independent platform source review

Verdict: **SOURCE GO** for the revised C11 compatibility and native preflight source reviewed on 2026-10-13. The previous pre-fixture preload/proof-mode contradiction is resolved in this source. This verdict does not claim an installed native flow, PostgreSQL readback, or final CI acceptance.

SHA-256 source identity:

| File | SHA-256 |
| --- | --- |
| `apps/mobile/package.json` | `1062510D33DE27E8F2976DC93226927B5505CC5E073C0D056984C6EA7B7C9C09` |
| `pnpm-lock.yaml` | `8305DDE1413A591DCDE8A9E7632EB51990CFD527791AC223067D92825FEDB9AF` |
| `apps/mobile/scripts/private-runtime-bundle-policy.mjs` | `D8597B69E4CF468E70A8DE407C1016139042646F0AF3F463CBF523C239639DA2` |
| `apps/mobile/scripts/private-runtime-bundle-preflight.mjs` | `29335DDF5A336E1476611970C432234E58D12E682929C8CC2CE0A38E7E3573A6` |
| `apps/mobile/scripts/private-runtime-device.mjs` | `DD534A8BECCCC4B055C3355DB626AEB40005BC014A3AEFF7B0F3F2B25659DF5D` |
| `.github/workflows/subtrack-native-device-proof.yml` | `E5DA604895C9849BB4DA93EE62EDBB6EC23A98FF819EBB58471E162B11070060` |

The direct mobile preset now pins exact `babel-preset-expo` `11.0.15`, matching installed Expo `51.0.39`'s declared range. The lockfile changes only the mobile importer and prunes the obsolete preset 10 / React Native 0.73 parser chain. Other importers, Expo, React Native `0.74.5`, Babel config, API/auth/SQL and CA source remain unchanged. Earlier independent direct transformation of React Native's `DebuggingOverlayNativeComponent.js` reproduced preset 10.0.2's `$ReadOnlyArray` failure and preset 11.0.15's success.

The revised graph preflight runs in `private-runtime-device.mjs` after the existing owned `harness.start()` and before native compilation. It receives the fixture's actual CA path, requires the existing true proof flag and private fixture config, checks the certificate path/permissions/public CA metadata, and retains the original loopback preload guard. The final invocation uses the installed `pnpm exec expo` shim with a file-URL preload, preserving Expo's declared dependency resolution; it does not add a dependency. The separate workflow pre-fixture step and false-proof child mode are gone. The export remains offline, private, bounded to an owned child, and reports only fixed result/category text; compiler logs and bundles are removed from private scratch and are not artifacts. Parent failure handling disposes the fixture. No new authority or trust mode is added.

The Android cold-start adjustment is limited to the owned disposable CI emulator: acknowledged `pm clear` follows APK install and precedes restoring adb reverse/debug Metro preferences. The Android-specific initial flow removes only the second `clearState`; iOS flow remains unchanged. The new source and policy tests preserve exact platform selection and ordering. The author reports full mobile 28/236 tests, typecheck, lint and 100% new policy coverage. The Conductor reports compiler-only local integration PASS for real CA plugin parse, original preload binding Node port 8081 to loopback, false-flag rejection, and both iOS/Android offline `export:embed` runs with CLI exit 0; no API, PostgreSQL or OTP call was part of that check. I inspected source and did not rerun those checks. The whole owned fixture/runtime must still pass in CI, followed by installed Android and iOS journeys, screenshots, durable readback, cleanup and exact-head gates.

I read ST-244's revised task boundaries, AGENTS, Constitution, current manifests/lockfile, the parent fixture runner, bundle policy/preflight, loopback preload, Android build and flow wiring, tests and workflow delta. I made no feature/test edit, heavy test/build, Git mutation or network call. No blocker or major platform source finding remains in this reviewed state.
