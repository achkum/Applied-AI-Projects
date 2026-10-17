# ST250 desktop command resolution independent SOURCE review

2026-10-14. **Platform/privacy SOURCE GO for the bounded helper/test repair.** Actual hashes match the root-supplied final tuple:

- tools/sandbox/download-draft.ps1: `ef9d22fb35bd5a0a7ad7b0d09bf27eb50ccb51d8720df347a9b0fd5386d93ade`
- tools/sandbox/draft-transfer-receipt.test.cjs: `bb278cc861b8995930783ec5b6557efe3e873d61884bf8a4e9a82f49f91a1ca3`

The sole helper change selects the first Application command result before assigning its Source to ProcessStartInfo.FileName. Multiple executable matches therefore produce one actual first-resolved application path, rather than an invalid array-coerced filename. Shell execution remains disabled; UTF8/no-BOM capture, CRT argument quoting, private stderr, native exit rejection and bounded process wait remain unchanged. No token, permissions, binary download, authenticated byte/remote validation or cleanup control changes.

The amended focused regression extracts the actual source functions, obtains a real application CommandInfo through module-qualified Get-Command, supplies two CommandInfo results and starts an actual native Node child in both Windows PowerShell5.1/current engines. Unicode JSON/no BOM, quoted/trailing-backslash arguments, exit7 rejection and private stderr checks remain. Root reports this one focused test PASS in both engines and whitespace PASS; reviewer inspected the changed sections without rerunning tests.

No material defect found. This resolves the source cause of the observed ProcessStart Win32code2 and unblocks the next actual local download attempt. It does not claim successful authenticated download/import or require repeating the already successful backend build/qualification/upload. No tests, rebuild, CI, Git, Docker, SSH or remote action; this evidence file is the only write.
