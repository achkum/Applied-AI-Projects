# Active artifact signed-return label repair

Bounded repair: ReturnSigned release body now describes a private signed testing candidate with measured runtime and unverified manifest. The sanitized stdout uses `runtime=measured`. Draft, prerelease, string `make_latest=false`, retention and never-publish constraints remain. Runtime validation and artifact bytes are unchanged.

Only two source files changed from the twelve-file handoff; the other ten hashes remain frozen.

| Path relative to SubTrack | SHA256 |
| --- | --- |
| tools/sandbox/download-android.ps1 | f7ab6f172cc73a00a4bb8944e4772a06df01ec66a35605404a5e182f231f8ff4 |
| tools/sandbox/android-transfer-receipt.test.mjs | 47e19e16b9e3038ac3d6b143c047f30dc13f7f685c0ac08fe7a755554b06ff29 |

Validation: the new named signed-return label regression passed (one test); PowerShell parser passed. No unchanged suites or runtime/external actions were executed. Ready for bounded independent source review; tool-archive diagnostics remain separate.
