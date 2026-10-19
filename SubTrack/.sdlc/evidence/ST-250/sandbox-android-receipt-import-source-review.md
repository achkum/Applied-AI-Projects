# ST-250 Android receipt importer source review

Decision: GO for the narrow source remedy. Independent platform/security review, 2026-10-14.

Scope: source inspection of `tools/sandbox/build-android.sh` and `tools/sandbox/android-release-receipt.test.mjs` only. No tests, build retries, Git operations, or external mutations were performed by this reviewer. This decision does not assert that a subsequent Android CI run has passed.

Reviewed SHA256 values:

| File | SHA256 |
| --- | --- |
| `tools/sandbox/build-android.sh` | `c153ee7cc78d57a1c29bbe5580c4551b3e3d3e67eb3cd691c7fcd3ee379e302b` |
| `tools/sandbox/android-release-receipt.test.mjs` | `4adae365f98a5a1bc82bcece3333d684011471c208c78641d3c58fab474b5d0c` |

## Observed failure and remedy

Actual Android run 38549837902 at source head 06b92be37729191772f934d6ac5766b3804ff462 passed dependency checks and emitted a final receipt, but the unsigned Release step exited 1. The original final `node --input-type=module -e` command supplied the imported receipt module path as `process.argv[1]`. The receipt module's standalone CLI guard therefore matched during import; dispatch received no mode, rejected the invocation, and set `process.exitCode = 1`. Import completion still allowed validated receipt output. The EXIT trap had already been removed after cleanup, explaining the absent failure-stage marker.

The reviewed final command uses fixed `st250-receipt-import` as `argv[1]` and imports the explicit module path from `argv[2]`. Those paths differ, so importing no longer activates standalone CLI dispatch. The module path remains a separately quoted shell argument and is converted with `pathToFileURL`; no evaluated path text or shell interpolation was added to JavaScript. Receipt data continues to arrive through stdin and pass `validateReceipt` after actual cleanup.

## Regression source assessment

The added regression extracts the actual inline expression from `build-android.sh`, requires the separate entrypoint argument, then invokes the expression in a Node subprocess with a synthetic valid receipt. Its assertions require exit status 0, empty stderr, and receipt equality. This directly covers the original import/CLI collision and avoids treating printed output alone as success. The existing unsigned evidence, schema rejection, private-data exclusion, and signed-schema separation tests remain present. Test results reported by the implementing agent were not independently rerun in this review.

## Preserved gates

The reviewed script retains Linux/CI, sandbox-origin, private-environment rejection, Java/preflight/config/dependency, source-head, and absent-native-directory guards. It still performs Expo Android generation and actual Gradle Release compilation, disables Release debug signing through the checked template, checks the unsigned APK, performs and verifies alignment, inspects the manifest and Hermes bundle, checks signatures, and validates a fixed scalar receipt. Private log placement, restrictive temporary-directory permissions, owned-path/symlink checks, failure cleanup, actual successful cleanup before the final receipt, and disabled APK transfer/upload remain intact. No signing, publication, private CA inclusion, or runtime-enabling behavior is introduced by the argument change.

No concrete source defect found in the narrow remedy.
