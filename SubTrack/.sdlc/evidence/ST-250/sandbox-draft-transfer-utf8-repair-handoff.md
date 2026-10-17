# ST250 desktop UTF8 capture repair

2026-10-14. Bounded consolidated-review HOLD repaired in only the two frozen source paths below. Invoke-Private now starts the exact native application with shell execution disabled and Windows CRT argument quoting, reads stdout/stderr concurrently using explicit UTF8 decoding, and writes JSON stdout/private stderr with UTF8-no-BOM. It preserves the actual native exit status and fixed private error handling. Existing gh release download --dir remains native binary file output; no remote or credential action was performed.

One focused regression PASS on installed Windows PowerShell5.1 and current PowerShell (version assertions enforced). It executes the actual source functions with a local Node child, verifies Unicode JSON bytes without UTF16LE or BOM, preserves embedded quotes/trailing backslashes in argv, and proves native exit7 is rejected with stderr isolated in the owned private log. Complete helper syntax check PASS. Unchanged policy modules and broad suites were not rerun.

- SubTrack/tools/sandbox/download-draft.ps1: fd8db83f4a7b6b25b0e7f061806242522a09a2ef020e066b4a68427f04c78376
- SubTrack/tools/sandbox/draft-transfer-receipt.test.cjs: 49ebc74cc8b8c4589491f0d9be871ca5b3555ec9bd91a7c80f9637cd630fe92f

The other six hashes in sandbox-draft-transfer-source-handoff.md remain unchanged. Independent source recheck/root curation precedes actual transfer/download. No remaining author blocker.
