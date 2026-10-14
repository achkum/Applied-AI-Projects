# ST250 Android unsigned Release/signing preparation source handoff

2026-10-14 author sandbox_delivery_audit. Exact seven-path source freeze with root/platform and independent privacy PLAN GO implemented. No Git/push/hosted build, dependency install, real signer/secret creation, Docker/VPS/remote mutation, account/spend/store/upload action.

## Working source behavior and boundaries

New ordinary PR/manual workflow uses standard ubuntu24, exact PR-head/nonpersistent checkout, contents:read, Node24.14, JDK17, direct npm-global pinned pnpm12.6.0/exact version/frozen install. Official SDK build-tools36/platform36/NDK27.1 selected explicitly. No signer/VPS secret, target event, archive/APK/log upload or invented download URL. The artifact cost condition is enforced by absence of upload steps and owned cleanup, not merely short retention.

Build helper guards Linux/CI/sandbox/canonical origin/absence of six private proof variables, actual existing preflight/config/dependency alignment and exact checked-out source head. Fresh Android source only; strict locked release stanza switches only public debug signer to null. Unknown/duplicate/repeated transformations fail. Actual Gradle Release compile with bounded workers/heap is followed by zipalign16KiB/check, compiled manifest/min24/target36/package/nondebug/cleartext/privateCA rejection, actual extracted Hermes header magic and actual apksigner unsigned failure checks. Android signed/debug APK cannot produce unsigned receipt. All raw manifest/signature/build logs stay private.

Original/generated Android APK tree and aligned private APK/log directory are removed through exact owned nonsymlink path checks before final fixed receipt. No successful cleanup receipt on unknown path/deletion failure. Failure cleanup is best-effort and does not publish a receipt. Gradle/runner dependency caches are runner-local rather than VPS; no artifact upload is enabled. Runtime remains false; unsigned packaging cannot be presented as installable sandbox behavior. Actual unsigned verification tool output format is fail-closed: any unexpected output is a real CI blocker, not assumed success.

Receipt module has separate unsigned/signed closed scalar schemas, accessor/prototype/extra-field/size/literal gates, fixed version/identifier/origin/runtime flags, SHA256 and positive reviewed versionCode. Signed schema validation is structural only and cannot substitute for real cryptographic verification/approved signer custody; no sign code claims such verification today. Actual inspect path requires unsigned artifact evidence, and constructor does not emit a final cleanup receipt until helper removal succeeds.

Signing helper initialize/sign deliberately refuse exit2 before key access/Docker operations; validate checks only source/image-reference intent. Tools-only Dockerfile takes a pinned caller-qualified JDK17 image and externally checksum-qualified official build-tools36 clean input, validates JDK/tool layout, UID996 and defaults only apksigner version. No download/material/namespace/remote action. Future execution/one-time key generation requires separately frozen authenticated artifact transfer, confidential backup, exact immutable signer identity, namespace/UID/resource/mounted-user checks and bounded offline one-shot execution. It is preparation, not an implemented live signer or installed tester APK.

## Actual checks

* Node syntax PASS; four focused contract tests PASS (no skipped cases): strict template/debug preservation, closed unsigned/signed schemas and hostile accessors, wrong package/debug/privateCA/cleartext/target/bundle/unsigned verifier rejection.
* Actual locked Expo54.0.37 `template.tgz` was read from isolated SDK checkout's installed package, not a fabricated fixture: strict transform restores byte-for-byte to original upon reversing its one null assignment; one debug assignment retained and exactly one release null assignment. Primary source SDK is merged but no local dependency reconciliation/install was performed for this check.
* Actual YAML2.9.1 parses workflow; exact event/head/contents/JDK17/ubuntu24/unsigned final action/no target/no secrets/no Corepack/no uploads assertions PASS.
* Bash syntax PASS for both helpers through existing Git Bash. Initial bare bash lookup unavailable on Windows, so existing absolute Git Bash was used. Actual sign mode fixed refusal observed; no signer command proceeded.
* Scoped tracked docs whitespace check PASS. No actual SDK installation/Gradle APK compile/signature/container/VPS/device operation; these remain required actual CI/execution gates. SDK integrated163/native observer23 tests were not repeated.

Independent privacy review found required non-enumerable data descriptors could pass validation then disappear during spreading. Root authorized the exact two already-frozen module/test paths. Validator now requires enumerable:true for every required field; regression checks hide each unsigned required field and both signed-only certificate/hash fields. Actual affected four light tests rerun PASS, no other unchanged checks repeated. Updated module/test hashes below replace initial values; other five source hashes remain unchanged. Final independent privacy/root review is still required.

## Exact source hashes

Paths relative Git root; independent review must match these bytes before curation/dispatch.

| Path | SHA256 |
|---|---|
| .github/workflows/subtrack-sandbox-android-build.yml | 83b6cf943827f94d70f4f629b99dc17968b956399e259ec23dbc2bfbd9316cc2 |
| SubTrack/tools/sandbox/build-android.sh | f3f9aaa7aeb573a4226551838811225393e575c3d98f2ad2adb57583adc50b9d |
| SubTrack/tools/sandbox/sign-android.sh | af93e8126d3670d52c488fe85f45d6379b8752c0cb07878323d8bfaeb0935864 |
| SubTrack/infra/sandbox/Dockerfile.android-signing | ea50d0ce93023ee66d07c3b3bcf96b92e35ffad3f1c9db298d1825ba9ee87e61 |
| SubTrack/tools/sandbox/android-release-receipt.mjs | d0864b1c07827e64ec10a33b0a707912e23e8ad09505e45d8e57e890a3312010 |
| SubTrack/tools/sandbox/android-release-receipt.test.mjs | b23673540e76bdc957910808914da62f991ba86c635848c36c7a01c213f805cb |
| SubTrack/docs/ops/SANDBOX.md | fa59ca5ecb021f12da3eb908bb3aacf80f4d9885bb7814b392b63bef64b14b5b |

Next ready gate: independent source/platform/privacy review, then root-curated actual unsigned Release CI. Persistent same-image backend/trusted TLS/native activation and unique signing/distribution/installed Android readback are separate gates. No product-completion percentage implied.
