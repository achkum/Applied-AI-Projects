# ST-250 SDK54 maintenance source handoff

Author: sandbox_delivery_audit. Date: 2026-10-14. Isolated branch `codex/subtrack-sdk54-sandbox`, base `49e716667e0082081f13a690571a21702da89f94`. Source is stable for independent review; no Git mutation, hosted dispatch, signing, upload or remote/VPS mutation was performed by this author.

## Result and scope

Incrementally migrated the existing Expo/RN mobile stack through SDK52 and SDK53 to Expo54.0.37 / RN0.81.5 / React19.1.0. Existing UI, canonical Money implementation, private development authority and app default identifiers remain intact. `newArchEnabled:false` deliberately retains the reviewed architecture. Reanimated3.19.1 is the sole official `expo.install.exclude`; exact installed version, RN compatibility and disabled new architecture are enforced by preflight, rather than skipped silently.

Added a manual sandbox-only unsigned iPhone archive route on the standard macos-15 runner with explicit Xcode26.2/iOS26.2. No signing credential, archive upload, store submission, EAS account or public runtime activation is introduced. The existing private native proof workflow also selects the maintained Xcode/simulator versions. The local actual sandbox Hermes exports passed for both platforms; they do not constitute installed native app acceptance.

The root-owned task amendment and copied `sandbox-ios-toolchain-contract.md` are separate metadata, not part of this author's 17-source-file roster. This checkout predates the newly committed sandbox client and backend; root integration must reconcile it with those reviewed sources and then perform meaningful integrated checks. In particular, React19 may require the same explicit undefined useRef initializer in the newer SandboxSession.tsx if the actual integrated compiler identifies it. No such unowned file was edited here.

## Actual validation

* SDK52 official dependency alignment and four actual Expo default/sandbox config cases passed.
* SDK53 official dependency alignment and the same four actual config cases passed. Initial Babel/TypeScript recommendation mismatches were corrected to SDK53's actual recommendations before advancing.
* Final actual Expo54 `install --check` passed, with the single deliberate Reanimated exclusion reported explicitly. Strict preflight checks manifest and installed Expo54.0.37, RN0.81.5, React19.1.0 and Reanimated3.19.1 plus the exact exclusion and `newArchEnabled:false`.
* Full mobile TypeScript noemit passed after the two frozen compatibility-only corrections: explicit undefined useRef initializer and SplashScreen.hideAsync void mock result.
* Four focused Jest suites passed, 69 tests: NativeSessionCore, NativeSession, RootLayout and privateMobileBillingMonth. The initial shared Babel helper resolution failure was fixed with mobile Jest modulePaths, using the existing mobile runtime dependency rather than a mock or added package.
* Three guarded actual SDK54 native template cases passed. They inspect the locked Expo package's real template archive. The new SDK54 marker branch rejects malformed scoped or duplicate/bare autolinking markers; it cannot fall through to the legacy SDK51 patch. Existing qualified SDK51 transformation/idempotence assertions remain.
* Four actual Expo54 config/default-isolation cases passed.
* Four canonical Money resolver cases passed using installed Expo Metro0.83.3's exported resolver and real dependency graph for both ios and android. The removed hardcoded Metro0.80 pnpm path initially failed; its exact frozen test was updated to the actual exported API/context. Original Money implementation and bridge assertions remain.
* Scoped ESLint passed for changed JS/TS/config files. Bash syntax passed for unsigned and private build scripts. Calling the unsigned build helper with `upload` refused with exit2. Workflow YAML/invariant checks passed: manual only, standard macos-15, contents read, no artifact upload action. Scoped whitespace checks passed.
* Frozen lockfile-only install with ignored scripts passed, including existing supply-chain checks.
* Actual sandbox Release-mode Expo/Hermes export passed: ios1496 modules/31 assets/4.07MB HBC; android1492 modules/32 assets/4.07MB HBC. Ignored outputs are in the task-local setup directory named sdk54-sandbox-ios-export-20261014 and sdk54-sandbox-android-export-20261014. These are local test outputs, not published artifacts.
* Web package manifest and existing canonical Money/bridge source matched Git base after normalizing checkout CRLF to Git LF. All nonmobile direct dependency specifiers/versions remain unchanged. Three existing web importer resolution strings gain the optional `babel-plugin-react-compiler@1.0.0` peer context from Expo54's Babel graph: next, next-intl and @vitejs/plugin-react. Do not claim byte-identical nonmobile importer lock entries. No web source was changed.

No native compiler/device is available on this Windows host: Java/adb/emulator/xcodebuild remain unavailable according to preflight. No actual macOS archive, Android binary, signed build, TestFlight upload, installed phone behavior, trusted public TLS or backend/device readback was demonstrated in this stream. Public runtime remains disabled. Independent review and integrated build/device acceptance remain required.

## Official compatibility evidence

* Apple upload requirement: https://developer.apple.com/news/upcoming-requirements/?id=04282026a
* Expo's minimum supported migration recommendation: https://expo.dev/blog/app-store-connect-minimum-sdk-26
* SDK54 release/compatibility: https://expo.dev/changelog/sdk-54 and https://docs.expo.dev/versions/v54.0.0/
* Last optional architecture support: https://docs.expo.dev/guides/new-architecture/
* Reanimated3.19/RN0.81 legacy compatibility: https://docs.swmansion.com/react-native-reanimated/docs/3.x/guides/compatibility/
* Official single-package recommendation exclusion: https://docs.expo.dev/versions/latest/config/package-json/
* Standard runner toolchain inventory: https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md
* Public repository standard runner pricing boundary: https://docs.github.com/en/billing/concepts/product-billing/github-actions

Versions were checked against official Expo sdk-52/sdk-53/sdk-54 package/bundled-module source and official npm registry for Reanimated3.19.1; RNTL13.3.3 React peer compatibility was checked against its official tagged package source. The copied toolchain contract records the architecture and signing boundary. A free runner preparation route is not an assertion that signing access exists or that Apple's paid Developer membership can be used unattended.

## Exact source custody

Paths below are relative to the isolated Git root, SHA256 of the actual source bytes at handoff. No source edits are pending from this author.

| Path | SHA256 |
|---|---|
| .github/workflows/subtrack-native-device-proof.yml | 60e097c65c83aa6049bc7c812e00bc8305c2fce443864b32b5d65672889bc1f8 |
| .github/workflows/subtrack-sandbox-build.yml | 32108be997885af37f2a4a55c28e1a761058963da55af5cbac1c36d6fd73c747 |
| SubTrack/apps/mobile/app.json | 169844deedc0c09c0fccf2bd4f145ea60d5283d9e4eb974afeb191e64458b702 |
| SubTrack/apps/mobile/jest.config.js | 117b77b894a67045a525323312513730aa81b02869f2eba3e2b8cef6fbc1edd1 |
| SubTrack/apps/mobile/metro.config.js | cdf164f5277c879fd97eb8ec9b6de5b3f7902f2998919ec78bb13b442cb7fcc9 |
| SubTrack/apps/mobile/package.json | 80a93ad3134f7212e4a27204b0d6120da0294d6b0c8232268443c26dbc0404c3 |
| SubTrack/apps/mobile/scripts/billing-month-resolver-test.mjs | 03abf9cd23f4af9ec027c4e96f1aff8ec34cb558c650025ca6984bc25891ae93 |
| SubTrack/apps/mobile/scripts/private-runtime-build.sh | 4e273107d09d4a2110f35d3b2c9d503fb6035a686cdfafd943395bca639456dd |
| SubTrack/apps/mobile/scripts/private-runtime-native-resolve-test.mjs | de545fb1cc9b0f1b8a33cf124ca3a3f177a2bb7a87ddf001408392b92e73ffe5 |
| SubTrack/apps/mobile/scripts/private-runtime-native-resolve.mjs | 0db9e6d09758d26ad26a2fb695f626e040ec0041baf60056cab4c2a572aee79b |
| SubTrack/apps/mobile/scripts/private-runtime-preflight.mjs | 2c4e55b494ed37becec88c15f70f083789f2113df8adad4a4ae22e4a3e2a7060 |
| SubTrack/apps/mobile/scripts/sandbox-app-config-test.mjs | 73475648084907e9d09c710cbd8772e6fec5f104d78021e6b06e8cd12b4c8b0f |
| SubTrack/apps/mobile/src/providers/RootLayout.test.tsx | 02a855554a60b0c6b2d4dab246e5bb735ec9d79b27e01807a30ee607836c6aeb |
| SubTrack/apps/mobile/src/state/NativeSession.tsx | 3965afe0775682766a4ff49bc798b74d9a2cdbb7a30a1afc71c1a1ed720b0f89 |
| SubTrack/pnpm-lock.yaml | 908862d83b4e3dd13f8e4be5159f15a2049b8b19b55356736b2d61729bb0c38f |
| SubTrack/tools/sandbox/build-ios.sh | dde994dc232113f791a544f372bc5c4d0bb5b80578c03ddd77fdd3b9f18be5d6 |
| SubTrack/docs/ops/SANDBOX.md | 8c014a9e432063f7ba3ea0c33fab34561ac48e5ea3a9ad3f877966e10e3cb01f |

Next: independent source/platform/privacy review; root curate and integrate the reviewed newer native/backend sources; meaningful integrated types and native toolchain build, followed by signing/access and installed-device acceptance. No arbitrary progress percentage is implied by these passing substrate checks.
