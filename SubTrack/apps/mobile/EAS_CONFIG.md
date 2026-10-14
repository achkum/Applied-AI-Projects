# Native private development configuration

ST-244 runtime handoff, verified 2026-10-13. Android and iOS are the current product targets. Native acceptance requires actual installed builds using the qualified private PostgreSQL API; configuration, unit tests and JavaScript export alone do not meet it.

## Existing SDK and build profiles

Compatibility evidence verified 2026-10-13: installed Expo 51.0.39 declares
React Native 0.74.5 in `bundledNativeModules.json`. Its locked CLI selects the
official SDK 51 template (51.0.56), which passes
`privacy_file_aggregation_enabled` to `use_react_native!`. The old 0.74.0
signature accepts neither that keyword nor arbitrary keyword arguments;
[Meta's 0.74.5 implementation](https://raw.githubusercontent.com/facebook/react-native/v0.74.5/packages/react-native/scripts/react_native_pods.rb)
supports it. The exact patch alignment preserves privacy aggregation, Expo
SDK 51, React 18.2 and unrelated dependency pins. Actual installed native
qualification is still required after this compatibility correction.

The locked Expo SDK 51 / React Native 0.74.5 / React 18.2 stack matches the [official SDK 51 release](https://expo.dev/changelog/2024-05-07-sdk-51). React Native aligns to Expo 51.0.39's own bundled declaration of 0.74.5; the SDK and unrelated dependencies remain unchanged. App assets are rasterizations of `docs/design/branding/orbit-light.svg`, preserving the established brand. `ios.supportsTablet` replaces the unrecognized `supportsTabletMode` key, using the [documented Expo configuration field](https://docs.expo.dev/versions/latest/config/app/#supportstablet).

The existing `development` profile produces Android `assembleDebug` and an iOS simulator artifact. It defaults private API access OFF. It does not claim an installed `expo-dev-client`: that dependency is absent. The [EAS configuration reference](https://docs.expo.dev/eas/json/) requires that dependency before setting `developmentClient:true`. The `preview`/`production` API_BASE_URL values and `submit` IDs/credential paths remain inactive legacy scaffolding, without verification or runtime consumption. They are not private native API fallbacks or approved store destinations. No build has been submitted, no account created and no public distribution authorized.

## Private API variables

Expo bundles statically referenced [EXPO_PUBLIC environment variables](https://docs.expo.dev/guides/environment-variables/). They are public configuration, never secrets. Copy `.env.example` to ignored `.env.local` only after private API/device routing and certificate trust are qualified:

```dotenv
EXPO_PUBLIC_MOBILE_ENROLLMENT_ENABLED=true
EXPO_PUBLIC_MOBILE_ENROLLMENT_HTTPS_URL=https://localhost:3443
```

The same variables configure accepted OTP and the new private mobile adapter. `getPrivateRuntime()` returns a frozen `{apiBaseUrl}` only on Android/iOS, with `__DEV__ === true`, explicit enablement and a valid HTTPS origin without credentials/path/query/fragment. Otherwise it returns null. There is no localhost, staging or production fallback. The old `API_BASE_URL` variable was never wired to Expo `extra` or statically inlined into the native bundle. Reload/rebuild after changing these values; release builds stay disabled even when a public flag is set.

## Build and qualification route

[Expo local compilation](https://docs.expo.dev/guides/local-app-development/) uses Android SDK for `expo run:android` and Xcode on macOS for `expo run:ios`. Windows local Android compilation is a candidate after a verified portable JDK/SDK setup. `eas build --local` is [not supported on Windows](https://docs.expo.dev/build-reference/local-builds/); cloud builds require account/access and are not being triggered. A physical iPhone requires a separately verified signing/device route. The current Windows inventory has no available Java, adb, emulator or Xcode commands.

The backend graph remains separate, direct TLS and loopback only. Candidate Android USB routing is `adb reverse tcp:3443 tcp:3443`, preserving `https://localhost:3443` certificate name and loopback server authority. This route still needs actual device qualification. Installing a user CA alone is insufficient on modern Android: [Android's trust configuration](https://developer.android.com/privacy-and-security/security-config) defaults to system CAs. A narrowly reviewed debug-only CA resource/configuration or qualified emulator trust setup must precede HTTPS evidence; no trust-all implementation or disabled certificate/hostname verification is allowed. On a Mac, an iOS simulator can use the Mac loopback API after its test CA is explicitly trusted. No tunnel, public listener or real provider is part of this plan.

Tooling preparation plan for review: portable [Microsoft JDK17 Windows x64 ZIP](https://learn.microsoft.com/en-us/java/openjdk/download-major-urls) and [Google Android SDK command-line tools](https://developer.android.com/studio) inside an owned ignored local tooling directory; verify official download checksums, use process-local JAVA_HOME/ANDROID_HOME/PATH, candidate packages `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`, with exact compatibility confirmed from the locked Expo51 generated build before installation/build, inspect licenses before acceptance, then compile a debug APK and run on a connected Android device or owned emulator. Do not install global services, change system environment, create accounts or upgrade SDK as part of this step. iOS compilation requires a discovered macOS/Xcode host; no native iOS pass is claimed from Windows.

## Read-only input checks and asset regeneration

```powershell
node apps/mobile/scripts/private-runtime-preflight.mjs
```

This verifies PNG dimensions/config/disabled defaults and reports tool availability without printing environment or credentials. It does not launch a server, compile a native binary or claim device acceptance. After dependency installation, assets can be regenerated using the existing locked workspace Sharp0.35.5:

```powershell
node apps/mobile/scripts/private-runtime-assets.mjs
```

The generator pins the existing SVG input and produces `icon.png`1024square, `splash.png`512square and transparent `adaptive-icon.png`1024square. A brand input change requires design review before repinning. A pre-existing absolute Sharp module path may be passed for isolated worktree regeneration; no downloaded image or added package is required.
# Installed private native qualification (ST-244)

The standalone emulator and AVD manager share one runner-owned
`ANDROID_AVD_HOME`, an explicit AVD data path and the actual Android SDK root.
Boot also checks and supplies the API 34 system-image directory. These
[documented process-local controls](https://developer.android.com/tools/variables)
avoid SDK/AVD discovery from the standalone tool's TEMP location; they change
no API level, tool version or trust configuration. AVD index/config checks and
bounded child-liveness waits precede installation.

The separate `subtrack-native-device-proof.yml` workflow compiles and installs
debug builds on Android API 34 (standard Linux runner) and iOS 17.5/Xcode 15.4
(standard macOS 14 runner). It uses the locked Expo 51/React Native 0.74 source,
an owned disposable PostgreSQL 16 fixture, loopback HTTPS and a development-only
ephemeral CA. The CA is generated only into Android debug resources and trusted
only in the disposable iOS simulator. Release trust is unchanged.

Metro JavaScript uses a separate debug-only loopback HTTP transport; its proof
process forces port 8081 to 127.0.0.1. API requests and credentials use HTTPS.
The local Maestro CLI is pinned to 2.11.0 with its official SHA256 digest and
Apache-2.0 license. No EAS account, cloud Maestro, store signing or submission
is used. Screenshots of accepted Add/restart/logout states and a closed build
receipt are the only uploaded artifacts; OTP, keys, credentials, raw tool logs
and native binaries remain private to the disposable runner.

Ubuntu's hosted SDK inventory does not include an emulator executable. The
Android proof therefore provisions Google Emulator 37.2.12 into runner TEMP,
using the exact official HTTPS archive `emulator-linux_x64-16428233.zip`.
Google's repository publishes SHA1 `cd7362ea55dfb86a418958138dc396e74165dd01`
and archive size 349654171 bytes. An independent download matching both
produced SHA256 `b08fc43d8608d2955f607f1b287beb525041e730086bdca3af152accac3af9c1`;
the script checks all three and the executed tool version. This provisions a
missing build tool; Android API 34, build-tools 34.0.0, Expo 51 and React Native
0.74 patch baseline remain unchanged. No global installation or service is created. Official
metadata: [Google Android repository](https://dl.google.com/android/repository/repository2-3.xml),
verified 2026-10-13; the package names the existing Android SDK license.
The Ubuntu runner also installs only the `libpulse0` client-library prerequisite:
actual C5 loader diagnostics identified missing `libpulse.so.0`, and the
[Google/AOSP emulator dependency list](https://raw.githubusercontent.com/google/android-emulator-container-scripts/master/emu/templates/Dockerfile)
names that package. This does not install or start a PulseAudio daemon/service.

This workflow source does not establish native acceptance. Acceptance requires
successful installed flows and independent review at the exact source head.
Installed evidence covers normal enrollment, profile, Just me, Add, app/API
restart with fresh verified login, and acknowledged logout UI. The separate
PostgreSQL/HTTP proof covers refresh rotation, consumed-secret reuse and old
Bearer rejection. Unit and mounted tests cover SecureStore faults; those are
not claimed as installed device fault scenarios. The database process itself
is not restarted by this native workflow.
Xcode 15.4 availability is checked explicitly; macOS 14 runner retirement on
2026-11-02 requires a reviewed replacement rather than an implicit SDK upgrade.

The mobile Babel preset is pinned to 11.0.15, matching installed Expo 51.0.39's
own declared baseline. The obsolete 10.0.2 preset selected RN 0.73 codegen and
rejected RN 0.74.5's ReadOnlyArray native command type. An early per-platform
static development export now checks the native JavaScript graph after owned
HTTPS fixture startup and before native compilation. It uses private disposable outputs, loopback
Metro only, a bounded owned child, the same real public CA and original proof-mode
guard. The compiler makes no API calls, OTP requests or delivery. Compiler
logs and exported bundles are never artifacts; installed acceptance remains required.
Android freshness clears only the owned disposable CI emulator app after APK
installation and before restoring localhost Metro preferences. The initial
Android flow does not clear those preferences again; the iOS flow is unchanged.
Official sources verified 2026-10-13: [Expo local compilation](https://docs.expo.dev/guides/local-app-overview/),
[Expo SDK 51 Xcode image](https://docs.expo.dev/build-reference/infrastructure/),
[GitHub macOS 14 inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-14-Readme.md),
[Maestro CLI installation](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli),
[pinned official release](https://github.com/mobile-dev-inc/maestro/releases/tag/cli-2.11.0),
[Apache-2.0 license](https://github.com/mobile-dev-inc/maestro/blob/cli-2.11.0/LICENSE).
