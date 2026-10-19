# ST250 draft transfer consolidated independent final SOURCE review

2026-10-14. **SOURCE GO for the full eight-path slice below.** This final disposition combines the independent platform/security/privacy review in sandbox-draft-transfer-independent-source-review.md with the bounded UTF8 repair re-review. It supersedes that review's sole desktop encoding HOLD. No concrete material defect remains in the reviewed slice. Only this evidence file was written; no tests, broad review, Git, Docker, token/remote/CI/SSH/VPS or external action was performed.

| Repository-relative path | Independently matched final SHA256 |
|---|---|
| .github/workflows/subtrack-container-proof.yml | 0010152a49d082e58a55478fe7cd31bf731b218a00b8fd816a56d5d3d76fd61c |
| SubTrack/tools/sandbox/draft-transfer.sh | 43c24d51bf068ac971dc85528f86ed52a5665419c059bcff2b80ff051b552b0c |
| SubTrack/tools/sandbox/draft-transfer-receipt.cjs | fbfdd1e22a18696a9ba20f7863eef634d28d00e38d5aed416b44fd8a1f570444 |
| SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs | 49ebc74cc8b8c4589491f0d9be871ca5b3555ec9bd91a7c80f9637cd630fe92f |
| SubTrack/tools/sandbox/download-draft.ps1 | fd8db83f4a7b6b25b0e7f061806242522a09a2ef020e066b4a68427f04c78376 |
| SubTrack/tools/database/sandbox-qualify.sh | b0f91ea2dde34ccea68f2a05ff7c07f55f703883cc69f86227b9c16ed0fefad0 |
| SubTrack/tools/database/sandbox-qualification-receipt.cjs | 0d6abd76af2a20dd3ffda1839345533370e0a1edb1e5d0aa1e2f3d31f09bcc1a |
| SubTrack/tools/database/sandbox-qualification-receipt.test.cjs | 5bcabba540aa73ba950b28392cf630ca9688854812b6b9b1cba1c5649c5bcde2 |

Both repaired hashes match sandbox-draft-transfer-utf8-repair-handoff.md; the other six match their original reviewed handoff. Re-review read only the repair handoff and two changed sources, plus all-eight hash comparisons. No unchanged suites or source review were repeated.

Invoke-Private now resolves an actual native application and uses ProcessStartInfo with shell execution disabled, explicit Windows CRT argv quoting, hidden execution and separate redirected stdout/stderr. Both streams are read concurrently with explicit UTF8 decoding and written as UTF8 without BOM. The actual exit code is captured before disposal and nonzero exits are rejected; the bounded wait terminates an overdue child. This removes Windows PowerShell5.1 text-redirection dependence while preserving quoted arguments and private diagnostics. Existing gh release download --dir still writes archive bytes directly to files, so binary download data does not pass through text capture.

The added focused regression executes the actual source functions on Windows PowerShell5.1 and current PowerShell with enforced version assertions. It checks Unicode JSON bytes/no UTF16LE or BOM, quotes/trailing-backslash argv preservation, exit7 rejection and isolated private stderr. The handoff reports that regression and helper syntax PASS; this reviewer inspected the meaningful source assertions without rerunning tests or claiming a live authenticated download.

All previously accepted controls remain covered by the prior review: explicit trusted manual authority and noncancelling transfer concurrency; token removal from child environment; one actual same-image journey and distinct non-image-cleanup candidate rather than closed v2; bounded image/archive/layer custody checks; exact owned cleanup and refusal of uncertain acceptance; strict nineteen-field uploaded manifest and separate final receipt; authenticated exact two-asset draft/default-head metadata; binary-safe desktop downloads with byte/hash/remote reread checks; and the existing VPS receiver exports and three fixed staging filenames. The encoding repair does not relax any receipt, source, image, upload or deployment gate.

This is SOURCE GO only. Actual reviewed manual dispatch, retention-mode same-image qualification, Docker archive validation, draft upload, exact-ID/local cleanup and final receipt, authenticated desktop download and execution-time cost/access policy recheck remain required. Draft staging remains unpublished with approved bounded retention; it is not a public tester link. VPS import/activation/UID/resource/TLS/readback and signed installed Android/iPhone acceptance remain separate execution and product gates.
