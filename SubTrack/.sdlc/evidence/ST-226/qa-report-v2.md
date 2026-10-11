# ST-226 Full API QA rerun
Verdict: PASS; fresh full API run exited 0 after process-local PATH correction; all 76 test files and 1,666 tests passed, none skipped.
OpenSSL resolved to existing `C:\Program Files\Git\mingw64\bin\openssl.exe`; no installation or source/test change was made.
The prior run's 12 HTTPS-suite failures were environmental `spawnSync openssl ENOENT`; rerun cleared them.
Raw logs remain private: `apps/api/.coverage-st226/full-api.log` (prior) and `apps/api/.coverage-st226/full-api-v2.log` (rerun).
C3 coverage JSON: statements 92.94%, branches 89.65%, functions 86.95%, lines 97.52%; all seven frozen blobs still match.
Frozen blobs: lifecycle.ts 2160895f61241f639f1cf97a0d06002a07ef7957; lifecycle.spec.ts 9cf39a803c2f1e1fcdbf812b5713d8f19cb60130; integration.ts e9f721087b6447993a8107c5fde46c6a3e55c52b; vitest.config.ts cd120639f208cc83571f61322430a082314f777d.
Frozen blobs: proof.sh 215c50c9a64f814cade725d440166e51e46d0cdf; test-proof.sh 65e1ce98a216ce60786e7d03dfe29208f20119e6; workflow.yml 05d874d38084337377f3104ac1978e8a2dc60098.
Local Docker/psql remain unavailable; actual ordinary-PG compiled TLS smoke is still unproven locally and exact-head Linux CI is required.