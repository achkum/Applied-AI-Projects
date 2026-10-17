# ST250 draft transfer source handoff

2026-10-14. Eight-path source slice complete under the approved transfer execution plan and two privacy PLAN GOs. Exact roster frozen in ST-250 metadata before source edits. No Docker, Git, release, CI, SSH/VPS or external mutation; no heavy or broad suite.

Implemented trusted manual carrier with original container-proof job preserved, separate contents-write job, pinned checkout/setup, exact repository/branch/input/event/checkout source equality, unique noncancelling transfer concurrency and pinned direct pnpm12.6.0. One existing same-image journey retains its actual immutable image only through the distinct strict private transfer candidate after measured non-image cleanup. Default host/image receipts and full cleanup remain unchanged.

Publisher validates actual captured image/defaults, exports bounded binary Docker archive, hashes raw/compressed bytes, validates actual archive config ID, Linuxamd64/config equality, every layer digest and private-path exclusions. Uploads only two exact assets to fresh default-head-targeted draft with make_latest string false, validates uploaded digest/state/type/size/IDs and exact reread roster, removes local image/archive/candidate/temp custody, then emits separate strict final receipt. Pending upload validation never claims future local cleanup. Known-owned failed drafts are removed; uncertain remote creation or qualification cleanup withholds acceptance. Token stays in publisher memory and is removed from child environment. No automatic deployment.

Shared exports: transferManifest(input); manifestBytes(manifest); transferReceiptEnvelope(input); draftTransferReceipt(input, manifest); assetNames(manifest); verifyUploadedAssets(release, manifest, uploaded); verifyRemote(release, receipt, manifest). Uploaded manifest and final receipt each have exactly nineteen scalars. VPS peer's existing transferManifest/draftTransferReceipt calls match. Existing authenticated gh desktop helper downloads exact names through native file output, validates remote metadata before/after, measured bytes and strict cross-bindings, and prepares only api-image.tar.gz + transfer-manifest.json + transfer-receipt.json in fresh private ACL-protected local staging. It invokes no SSH/import or credential export. SANDBOX.md untouched.

Validation: eight focused transfer tests PASS, including actual small tar archive validator with config/layer drift and private-path refusal; fourteen qualification receipt tests PASS. Both changed policy modules enforce100% lines/branches/functions. Inline Node/Bash/PowerShell syntax and unique-key workflow/manual-job checks PASS. No same-image run or draft/download acceptance claimed by these units. Root reported independent actual same-image06b92be qualification succeeded before this slice; new retention/transfer source still requires consolidated independent review and one actual reviewed execution.

Exact hashes (repository-relative):
- .github/workflows/subtrack-container-proof.yml: 0010152a49d082e58a55478fe7cd31bf731b218a00b8fd816a56d5d3d76fd61c
- SubTrack/tools/sandbox/draft-transfer.sh: 43c24d51bf068ac971dc85528f86ed52a5665419c059bcff2b80ff051b552b0c
- SubTrack/tools/sandbox/draft-transfer-receipt.cjs: fbfdd1e22a18696a9ba20f7863eef634d28d00e38d5aed416b44fd8a1f570444
- SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs: e0f34714e4e4f0599f89ce35c69a779a5781a9008c2e493cffdd94bb6f7c3352
- SubTrack/tools/sandbox/download-draft.ps1: 9875985c03e50288e00521eb81af0169b0329a8d44929220cbc4e5af0ced7df2
- SubTrack/tools/database/sandbox-qualify.sh: b0f91ea2dde34ccea68f2a05ff7c07f55f703883cc69f86227b9c16ed0fefad0
- SubTrack/tools/database/sandbox-qualification-receipt.cjs: 0d6abd76af2a20dd3ffda1839345533370e0a1edb1e5d0aa1e2f3d31f09bcc1a
- SubTrack/tools/database/sandbox-qualification-receipt.test.cjs: 5bcabba540aa73ba950b28392cf630ca9688854812b6b9b1cba1c5649c5bcde2

No author implementation blocker remains. Current holds are independent source review, policy recheck before actual transfer, and root-controlled runtime dispatch/cleanup evidence. Draft staging is unpublished writer-only transfer custody, not a public tester link. VPS activation, Android signing and installed-device behavior remain separate.
