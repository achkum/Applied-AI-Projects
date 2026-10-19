# Android signing deployment compatibility source handoff

Owned source: `tools/sandbox/sign-android.sh`, `download-android.ps1`, `android-transfer-receipt.mjs`, `android-transfer-receipt.test.mjs`. No other source changed by this slice. Existing `image-import-binding.cjs` reused unchanged.

Tools archive validation now streams compressed custody, raw tar headers/member hashes and ordered layer DiffIDs in 64KiB chunks. Metadata retention is limited to <=1MiB per member within the existing tar member bound. The shared member validator retains actual config/source/runtime/layer/OCI checks and permits only the already approved complete exact Go V1 compatibility sideconfig chain. No whole raw archive or layer Buffer is required. Only the obsolete twice-raw-tar RAM term was removed; the original 1310720KiB floor and raw-tar-plus-256MiB disk guard remain.

Docker load's observed imported ID is independently bound to the exact exported config digest, full normalized Config portfolio and ordered RootFS through the unchanged backend binding primitives. A strict private twelve-scalar import record binds artifact head, tooling head, run, transfer receipt/manifest/archive/raw hashes and both exported/imported IDs. Later container use requires fresh inspection and full record validation. Import serializes with an owned lock and tracks new imported image identity for failed-import cleanup; there is no arbitrary image fallback or global sweep. A process killed before Docker emits an identity cannot prove that unreported image's cleanup; this limitation is not claimed as a measured cleanup guarantee.

Desktop source authority requires an independently reviewed `SigningToolingHead`, tracked clean helper bytes and their actual SHA256 values. APK and tools still must share the same genuine immutable `SourceHead`; no 23b tools/8c APK mixing or artifact relabeling. Primary project validation uses real package name subtrack/private boolean true, retaining realpath/reparse/ACL/ignore gates. Host 996:987 and image/container 996:996 remain distinct.

Validation: nine affected Node tests passed, including actual 48MiB raw and gzip layer fixtures in an isolated child with a 64MiB V8 heap, >1MiB Buffer allocation/whole-file reads blocked and RSS bounded to 192MiB; stream byte substitution and unrelated extras reject. Complete V1 streaming positive and hostile import/config/rootfs/source/tooling mutations reject. Actual local PowerShell project-marker positive/negative checks passed. Final Bash/PowerShell/module/test syntax and scoped ESLint passed. A subsequent narrow streaming test passed after forwarding source-stream errors into the gzip consumer.

No actual Docker import, signing, key access, deployment, CI, release, Git or external action ran. Source review is required before execution. Actual candidate APK receipt qualification and new same-head tools build remain root-owned prerequisites.

SHA256:
- sign-android.sh: 8893617d40419f9391bd4807874cdee3cde0e8e4bf98b39dce4f9282082bd81d
- download-android.ps1: 45611f9ff0c6182eb17962497d00988c249cbf3ecf48a3472d1c7ad0a195bf28
- android-transfer-receipt.mjs: d7450d8b00727830d83f8865872fef1f6fdac595eaceb96ab476c6e08690c464
- android-transfer-receipt.test.mjs: c0c4f21bc1e3f872437bc7d9a5a35a995107033852d8896eb9f4b6e095252ae6
- unchanged image-import-binding.cjs: eb463a9015a7590cb2ef582cf9dca5e146628eef3d1b64b6b81a2f21d5b73f4a