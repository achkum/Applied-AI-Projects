# ST-210 independent QA

Verdict: **PASS for focused QA and API static gates; module branch coverage is 75.00%.** No source or test files were modified by QA.

- Focused actual-TLS + service suites: 2 files, 21 tests passed. Test-only code access remained process-local.
- Focused v8 coverage: adapter 95.18% lines / 88.88% statements / 87.65% branches; module 83.33% lines / 82.92% statements / 75.00% branches. Both production files exceed 80% line coverage; module branch coverage is below 80%.
- `corepack pnpm lint` and `corepack pnpm typecheck` from `apps/api`: PASS. Root Turbo wrappers were also attempted and could not locate the package manager binary; the direct API gates completed successfully.
- Full API regression: 61 files, 1,227 tests passed (prior independent run; static-only author fixes followed). Web regression: 11 files, 138 tests passed (prior independent run; no web changes).
- Focused command: `corepack pnpm exec vitest run src/auth/otp-v2/mobile-enrollment-otp-http.spec.ts test/mobile-enrollment-otp-http.spec.ts --coverage`, with `C:\Program Files\Git\usr\bin` on PATH for TLS.
- Earlier QA invocation lacked Git OpenSSL on PATH and failed before TLS initialization; rerun above passed.
- LF-normalized SHA-256 verified against current source: adapter `F35F43BBB1511362BA09AA115781CCD3D90ADA5E7F66858EB55A8A270C1490F2`; module `78C3200BE935114BFC530DAAA55DF64ACEA86306673975493567A4A42725F162`; unit spec `3FADAAC809F9900E965C6328D62C91B4D030C2341F6B3B26CCA13D9388711824`; TLS spec `0C2C68F060B2D24F32AFDED0C1F95CC9B8F10128D1B5E856674EEC568753ED43`.
- Independent platform/security approval and exact-head CI remain outside this QA execution and are unclaimed.
