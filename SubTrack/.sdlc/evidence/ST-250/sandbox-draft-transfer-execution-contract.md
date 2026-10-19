# ST250 draft transfer execution contract amendment

2026-10-14. Planning only; supersedes the new-workflow path and field-roster portions of sandbox-draft-release-transfer-plan.md. Its existing independently reviewed cost/access, draft-only/default-target, same-qualified-image, bounded export, exact-ID cleanup and binary-safe desktop rules remain. No source implementation, token access, release/tag/asset action, export/download, dispatch, Git or remote mutation.

## Exact nine source paths for root freeze

1. `.github/workflows/subtrack-container-proof.yml` existing registered carrier, replacing proposed new subtrack-sandbox-draft-transfer.yml.
2. `SubTrack/tools/sandbox/draft-transfer.sh`
3. `SubTrack/tools/sandbox/draft-transfer-receipt.cjs`
4. `SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs`
5. `SubTrack/tools/sandbox/download-draft.ps1`
6. `SubTrack/tools/database/sandbox-qualify.sh`
7. `SubTrack/tools/database/sandbox-qualification-receipt.cjs`
8. `SubTrack/tools/database/sandbox-qualification-receipt.test.cjs`
9. `SubTrack/docs/ops/SANDBOX.md`

Original container-proof job remains byte-for-byte unchanged and may still run. Add workflow_dispatch inputs sandbox_transfer boolean defaultfalse and source_head string defaultempty; only the new transfer job requires manual sandbox_transfer=true plus exact40hex source_head. No PR/target/workflow_run publication or executable artifact promotion. Transfer job has only contents:write, immutable pinned checkout with persist-credentials:false, reviewed branch ref `refs/heads/st/native-synthetic-bank`, repository achkum/Applied-AI-Projects, and checkout/input/event github.sha equality. Root dispatches only the independently reviewed commit on that exact branch; history/checkout equality and exact source hash tuple are enforced before token-bearing operations. Non-transfer/manual/PR behavior and original read-only proof remain unchanged.

Prevent whole-workflow cancellation of transfer custody: only explicit manual transfer uses a unique runID concurrency group and cancel-in-progress:false; ordinary original event grouping/cancel policy stays unchanged. Job-level concurrency alone cannot override a cancelling workflow group. The new job installs exact reviewed pnpm12.6.0 by npm/direct version assertion, invokes only draft-transfer.sh and emits no bulky Actions artifact. Release upload token comes only from short-lived job GITHUB_TOKEN to the publisher process/private memory; no credential args/files/logs/export/desktop/VPS handoff.

## Finite execution and qualification retention

Parent publisher creates unique private0700 custody. Exactly one existing image-v2 journey builds and qualifies the image; finite parent-transfer mode retains only the captured qualified immutable image after API/pools/PG/database/network/mounts/keys/hostname/private-log cleanup. Its strict private candidate must contain existing measured27 pre-image-removal flags plus explicit observed non-image cleanup, exact run/source/image/main/SQL/Dockerfile/pinned-base tuple and captured ID/run label. It is not closed v2 and cannot claim imageCustodyRemoved or full cleanup. Default host-v1/image-v2 still remove the image and emit their original honest receipts. No harness/business/config/DDL/clock/ordered-assertion changes, second build, host-main fallback or alternative image.

Publisher validates this actual private candidate and checks image ID/label/defaults and byte tuple. Export only that image via bounded docker save/gzip (10min, compressed<=1GiB/raw<=2GiB), inspect config digest/layers/context for credential or row material exclusion, and measure both raw/compressed size/SHA. Raw archive and diagnostics remain private. Build-time/source/token key material is absent from image; mounted qualification material has already been removed. Failure/unknown cleanup withholds eligibility.

Resolve existing repository's default branch/head by read-only API at execution and bind exact defaultTargetHead independently. Refuse any existing draft/tag collision; create fresh st250-stage-<sourceHead>-<runId> with target_commitish=defaultTargetHead, draft:true/prerelease:true/make_latest:false. This tag/default target is honest staging metadata, not a claim that feature source lives at the tag. Body/names/manifest separately bind actual qualified sourceHead. No publish/latest/discussion or immutable-release claim.

## Uploaded byte manifest: exactly nineteen scalars

Exact own enumerable data fields; reject missing/extra/accessor/prototype/symbol/wrong-type/false/mismatched values:

schema=`st250-transfer-manifest-v1`; proof=`docker-image-postgresql16`; sourceHead=lower40hex; runId=runID-attempt decimal pair; defaultTargetHead=lower40hex; draftTag=exact derived staging tag; imageId=sha256:lower64hex; baseImage=exact approved Node22.18 Linuxamd64 pin; dockerfileSha256/compiledEntrypointSha256/foundationSha256/businessSha256=lower64hex matching candidate; archiveSha256/rawTarSha256=lower64hex measured bytes; archiveBytes=integer1..1073741824; rawTarBytes=integer1..2147483648; runtimeUid=1000; runtimeGid=1000; sameImageQualified=true only after all real journey/tuple assertions passed.

It contains no releaseID/assetID/self-digest/cleanupConfirmed/future upload claim. Canonical exact JSON bytes are measured before upload, maximum16KiB. Two assets only: subtrack-sandbox-api-<sourceHead>.tar.gz and st250-transfer-<sourceHead>.json. Names derive from sourceHead and are not caller-provided filenames. Manifest is upload-time byte/candidate evidence while archive/image remain held; it is not a local-cleanup receipt.

## Final local cleanup receipt: exactly nineteen scalars

schema=`st250-draft-transfer-receipt-v1`; sourceHead; runId; defaultTargetHead; draftTag; releaseId=positive safe integer; draft=true; imageId; archiveSha256; archiveBytes; archiveAssetId=positive safe integer; manifestSha256; manifestBytes=integer1..16384; manifestAssetId=positive safe integer; manifestSchema=`st250-transfer-manifest-v1`; sameImageQualified=true; uploadVerified=true; localCleanupConfirmed=true; remoteCustody=`draft-retained`.

The full code/base/raw/archive/UID tuple is bound by the independently downloaded manifest's exact SHA/bytes, not duplicated into an oversized/nested receipt. Receipt field equality with that manifest and uploaded assets is mandatory. No nested remote receipt or self digest. Receipt is generated only after archive+manifest uploads are state:uploaded with exact names/bytes/content types/GitHub sha256 digests, re-read draft release/defaultTargetHead/tag and exact two-asset roster agree, and all captured local image/archive/candidate/credential/temp custody is removed with successful absence checks. Remote draft assets are intentionally retained; localCleanupConfirmed never claims remote deletion. Do not upload this future cleanup receipt as one of those two assets. Root obtains the tiny final receipt through fixed sanitized job output/summary, validates against source/run and authenticated remote metadata, and never treats an incomplete upload manifest as final transfer acceptance.

Failure captures exact release/asset/image IDs and removes only verified newly owned partial draft/assets/local custody, refuses published/unowned resources, clobber/overwrite and broad deletion. Unknown remote deletion blocks eligibility and reports only finite fixed failure stage. Resume requires identical owned tag/default target/manifest/archive/source bytes, never new unrelated IDs. No silent successful retry after unknown upload.

## Desktop and later VPS eligibility

Downloader requires the final closed receipt plus exact repo/release/asset IDs. Existing authenticated gh fetches exact draft/tag/name through native binary-safe file output into a fresh private owned nonsymlink directory; no token export, text pipelines, redirects with manually forwarded token, latest/glob/clobber. First validate authenticated draft/default-target/two-asset roster and GitHub digest/size, then both downloaded byte hashes/size and strict uploaded manifest/final receipt cross-bindings, including actual image/raw-tar/code tuple. No upload-time manifest alone permits transfer.

The helper prepares only verified image archive/manifest/final receipt in fixed-owned local staging; explicit reviewed direct OS ssh/scp/import contract remains a separate gate before VPS mutation. Never copy GitHub/CI credentials or use OpenClaw application/services. Retained draft has bounded<=7day custody and exact-ID audited disposal, never publication or a tester link. Android APK retention/signing/public download and trusted HTTPS/deployed guest/device acceptance remain separate scopes. Existing unmetered Release policy is rechecked immediately before execution; no new account/spending.

Root/independent platform/privacy amendment review and exact nine-path freeze precede implementation. Carrier exists, but modified manual transfer capability is not claimed registered/executed until actual API acceptance. This is one coherent image staging slice, not a deployment approval or product completion percentage.