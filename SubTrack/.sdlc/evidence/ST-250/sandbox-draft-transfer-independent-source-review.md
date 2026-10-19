# ST250 draft transfer consolidated independent SOURCE review

2026-10-14. **SOURCE HOLD, limited to the desktop JSON encoding correction below.** Independent platform/security/privacy review of the stable eight changed paths, source handoff, approved execution contract and both privacy PLAN reviews. All eight actual SHA256 values match the source handoff. No tests, Git, Docker, token access, release/assets, CI, SSH/VPS or external actions were performed; this evidence file is the only write.

| Repository-relative path | Matched SHA256 |
|---|---|
| .github/workflows/subtrack-container-proof.yml | 0010152a49d082e58a55478fe7cd31bf731b218a00b8fd816a56d5d3d76fd61c |
| SubTrack/tools/sandbox/draft-transfer.sh | 43c24d51bf068ac971dc85528f86ed52a5665419c059bcff2b80ff051b552b0c |
| SubTrack/tools/sandbox/draft-transfer-receipt.cjs | fbfdd1e22a18696a9ba20f7863eef634d28d00e38d5aed416b44fd8a1f570444 |
| SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs | e0f34714e4e4f0599f89ce35c69a779a5781a9008c2e493cffdd94bb6f7c3352 |
| SubTrack/tools/sandbox/download-draft.ps1 | 9875985c03e50288e00521eb81af0169b0329a8d44929220cbc4e5af0ced7df2 |
| SubTrack/tools/database/sandbox-qualify.sh | b0f91ea2dde34ccea68f2a05ff7c07f55f703883cc69f86227b9c16ed0fefad0 |
| SubTrack/tools/database/sandbox-qualification-receipt.cjs | 0d6abd76af2a20dd3ffda1839345533370e0a1edb1e5d0aa1e2f3d31f09bcc1a |
| SubTrack/tools/database/sandbox-qualification-receipt.test.cjs | 5bcabba540aa73ba950b28392cf630ca9688854812b6b9b1cba1c5649c5bcde2 |

## Required bounded correction

`download-draft.ps1` defines Invoke-Private using `& $Command @Arguments 1> $Output`. This redirects Node and gh JSON into files using the calling PowerShell version's native-output/text-redirection behavior. Windows PowerShell5.1 writes redirected text as UTF-16LE, while both embedded remote validators and the module CLI read those files using Node `readFileSync(..., 'utf8')` or its UTF-8 JSON conversion. Consequently a valid authenticated release cannot pass the remote JSON validator when the helper is run with Windows PowerShell5.1. The source contains no enforced compatible PowerShell version, so syntax parsing and existing string-presence policy tests do not establish this executable boundary.

Make native JSON capture explicitly UTF-8 without BOM independently of caller defaults, preserving private stderr and exit checking, or enforce and document a compatible required PowerShell runtime before any staging work. Keep archive bytes on gh's native `release download --dir` path. Verify the actual helper's JSON capture/Node parse with the intended Windows invocation, including authenticated metadata-shaped nonsecret fixtures; no real token/release/download action or broad suite is needed to resolve this source defect. An archive binary download test alone would not cover it.

## Accepted source controls

The write-capable job is restricted to explicit manual transfer in the exact repository/branch with input/event/checkout head equality, pinned checkout without persisted credentials and pinned tooling. Transfer concurrency is unique per run and disables cancellation at workflow level. The original proof job remains separate. GITHUB_TOKEN is confined to the publisher process and deleted from the environment before qualification/export children are spawned; credentials are absent from arguments, artifacts and desktop/VPS interfaces.

Parent-transfer mode invokes one existing same-image journey and preserves the default host/image receipt behavior. Its distinct strict private candidate contains the original twenty journey checks plus seven image checks, explicitly confirms non-image cleanup and keeps cleanupConfirmed=false without imageCustodyRemoved. Captured image ID/label/head/run/main/DDL/Dockerfile/base bindings precede export. Cleanup removes only the checked captured image and exact private owned directory; unknown qualification or remote-create cleanup cannot produce acceptance. Failed remote cleanup refuses published or mismatched release identities.

Export and compression use finite time/size ceilings and private binary output. Archive validation binds saved configuration bytes to the inspected image ID, Linuxamd64, exact inspected config and all rootfs layer digests, and checks known private material path exclusions without extracting arbitrary image paths into the host. Existing focused tests exercise the actual archive validator with config/layer/architecture/private-path cases. These source tests were inspected, not rerun; actual hosted Docker archive shape remains an execution requirement.

The uploaded manifest and final cleanup receipt each require exactly nineteen own enumerable scalar fields, reject malformed/accessor/unknown inputs and cross-bind canonical manifest bytes/hash/size with archive/source/run/image/default-target tuple. Upload verification requires exactly two uploaded assets with exact IDs/names/size/digest/content type plus draft/prerelease/tag/default-target metadata. The final receipt is withheld until local image/archive/candidate/temp removal succeeds. The fresh draft targets the independently queried default head, while sourceHead separately describes the qualified feature source; no publish/latest or public tester link is claimed.

Desktop source protects fresh staging with a private ACL, validates the final receipt and authenticated release before download, uses gh's exact derived names and native file output without clobber/token export, checks archive/manifest bytes and hashes, validates manifest/receipt cross-bindings and rereads mutable remote metadata. The JSON capture defect above blocks this otherwise coherent path. Resulting three fixed staging filenames and transferManifest/draftTransferReceipt exports match the existing VPS receiver interface; direct SSH/import/activation is outside this slice.

## Remaining execution gates

After the bounded correction and updated hash/source review, actual modified manual dispatch, retained same-image qualification, export/archive validation, draft upload and exact-ID cleanup, final receipt delivery, authenticated desktop download and cost/access policy recheck remain required. Draft custody is unpublished and bounded to seven days under the approved contract. Actual VPS import/UID/mount/resource/TLS/readback, Android signing and installed Android/iPhone acceptance remain separate. This review makes no runtime, transfer, deployment or product acceptance claim.
