# ST-252 measured release bottleneck and frozen delivery scope

ST251 feature source55e2ffb is reviewed and locally validated; PR293 applicable checks continue. Current hosted Android version2 is preserved. A premature version3 feature-branch dispatch failed before compilation on the existing delivery-branch guard; no artifact or private draft was produced. Keep that guard; future APK source is a reviewed integration descendant.

Measured update blockers: APK/tools source equality despite an unchanged pinned toolchain; desktop always requires fresh tools custody; current signer execution source conflated with retained tools import source; mutable latest signing history invalidates an older hosted run; initial-only publication rejects the existing APK. These implementation constraints require a bounded update lane, not key/backend resets or repeated 257MB tool transfers.

Frozen signer/desktop and gateway owners implement the six task paths. Reuse must prove unchanged raw pinned signing Dockerfile/tool bytes, exact existing tool archive/import/image/version authority and original certificate/backup. Retain exact per-run signing history and strict monotonic latest history. Qualify an explicit exact predecessor; retain old metadata/bytes; atomically publish verified successor bytes then activate only the gateway. Failure/rollback preserves key, latest signer history, API, database and tester data. No store/production release or real integration.

Pending: focused executed source/mutation tests, one consolidated independent platform/security review, source commit/PR/applicable checks and actual successor signing/hosting. Actual installed Android acceptance and iPhone signing access remain separate.

## Required operator handoff

Hosting must copy the exact validated tools-reuse.json bytes from fresh staging/android/<newRun> into the already-owned staging/android-hosting/<newRun>; no reconstruction or field relabel. Preserve its hash and retained tool manifest/receipt/import identity. The signer creates only immutable signed-history.json in this directory before latest-history advancement; root stages the final qualified signed.apk, pending.json and verified-receipt.json exclusively afterward. Before successor signing, seal the genuine current V2 history with full predecessor receipt/manifest/public-byte checks.

Actual operator must adopt reviewed execution helper source under the 13-source ledger with exact old/new source custody history, while retaining existing import tooling authority and backend artifact/image. StageApk reuses retained tools and never mirrors/reimports them. Gateway-only activation occurs after verified successor qualification and metadata promotion. Keep original API/DB IDs, source/import/receipt histories and rollback publication evidence; backend readback and trusted HTTPS APK hash must be verified afterward. This operator is not yet executed or approved by source review alone.

## Frozen signer validation

The four signer/desktop paths are frozen. New retained-tools proof, history/monotonicity, actual history copy/exclusive-stage behavior and desktop raw-Git/strict-first-build checks all pass (4 focused tests). The 25 unchanged transfer tests passed before correction of two new fixture failures; corrected new tests were rerun once. Node, Bash and PowerShell parser checks, all signer Node heredoc syntax checks and scoped diff checks pass. No UI suite, toolchain build, transfer, signing key or live service operation was repeated.

Source SHA256:
- sign-android.sh: c216e05a8ccb7b86dade3d23cc77c6e9100f822b7868cd1ecdf6367e5d50ee20
- download-android.ps1: f311cfbcd09c864fe6a1326f570d8408211b089e337146eb9b9090137b1b9a3f
- android-transfer-receipt.mjs: fb48fba5ddd525cae419691aa5beadb0dd573e8ad1e4aa60c07570869a903bbf
- android-transfer-receipt.test.mjs: 240be421f5a1de47fd3563bbdc819910af22fc8660ec1a857b57e580f6e35249

Final independent consolidated review and new-head applicable CI remain pending. Actual version3 custody/publication requires an exact reviewed delivery-branch source; no dispatch/retry is authorized by a source test alone.

## Validation HOLD requiring correction

Consolidated review caught a new test reading historical tools commit1655 outside CI depth2. The production raw old/new Git verification remains necessary; the test must use a self-contained fixture without relying on unavailable checkout history. Root actual Linux history test failed before mutation on shell conditional syntax from the Windows checkout fixture. Author is tracing and correcting test source extraction; no source acceptance claim until rerun. Previously qualified Linux publisher replacement/rollback test remains unchanged.

The test-only shallow-history HOLD is corrected: fixtures now use the current raw HEAD Dockerfile plus the exact literal known digest and substituted-byte negatives; production StageApk still verifies both actual old/new raw Git blobs. Affected three tests pass. Test-only CRLF normalization restores Linux source-block execution; root actual fresh Linux history snapshot test passes. Final transfer-test SHA256 is 300d5586b1c95c65a0721b7fea9fd85007825a9f36ef9c46c3cd39e201dfbb7b. Three production signer hashes above remain unchanged. Consolidated reviewer is checking only this final delta.
