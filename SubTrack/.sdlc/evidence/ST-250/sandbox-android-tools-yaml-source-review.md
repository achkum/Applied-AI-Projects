# ST250 tools-only YAML parser independent SOURCE review

2026-10-14. **Consolidated platform/privacy SOURCE GO for the bounded two-path repair.** Actual hashes match:

- .github/workflows/subtrack-sandbox-android-build.yml: `8b1c4c86e94697cd5b8ea63d85ac5a2007e0e630350c8f6a24f1b0f2ffd4e471`
- SubTrack/tools/sandbox/android-transfer-receipt.test.mjs: `9bd1530df649854f9243fcb2f1e408caa531822051b0ba6de97ed93e1ffa9b94`

Reviewed only the tools parser bootstrap, actual heredoc/traps and test loader/regression. No material defect found. The signing-tools contract step uses a fresh umask077 runner-temp directory, fixed HTTPS yaml2.9.1 archive with redirects refused, bounded1MiB read/time and exact SHA512 integrity also checked against the frozen lock's resolution and dependency-free snapshot. Extraction occurs only after integrity verification with owner/permission restoration disabled; exact package name/version and absent runtime/optional/peer dependencies are checked. No install/lifecycle execution or application dependencies are introduced. EXIT removes only the captured fresh directory; INT/TERM fail and reach cleanup. YAML literal/heredoc layout retains executable Bash/Node structure.

The tools-only explicit parser port requires its mode/path/package identity; it never silently falls back to workspace modules. Ordinary APK tests still resolve the exact installed locked yaml2.9.1. Existing contract tests and registered authority/typed-input assertions remain; none are skipped or relaxed. The added fresh subprocess rejects workspace .pnpm access and exercises the actual registered test, while negative cases reject missing tools port, wrong mode/package/version/dependencies, changed lock integrity and invalid/bounded archive bytes. Author reports focused registered/fresh subprocess tests and negative cases PASS; reviewer did not rerun them.

Manual authority, token step placement, source/head, permissions, APK/tools schemas, archive/signing and artifact/cleanup eligibility are unchanged. This repairs a tools-only test substrate prerequisite, not actual tool-image/build/upload success. No broad suites, research, Git, CI, Docker, keys or runtime/external actions; this evidence file only.
