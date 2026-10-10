# ST-225 fresh full API QA
- Frozen blobs verified before and after: runtime `fa32eb00cab4d2854f1191b647d14fd6b352c052`; spec `529a859c5dd622c9f4f78980be2b32cfedae8b49`.
- Command: `corepack pnpm --filter @subtrack/api test` from `SubTrack/`; PASS, exit 0, 75/75 files and 1,640/1,640 tests; no failures or skipped tests.
- Raw stdout/stderr retained privately at `apps/api/.coverage-st225/full-api.log`; no raw output or payloads included here.
- Composition spec includes actual direct HTTPS request tests (including parser boundaries and unsupported encoding/charset) and late listen bind cleanup/port reuse (spec lines 151-185, 320-387, 570-595).
- Author focused changed-runtime coverage: statements 93.10%, branches 95.41%, functions 83.33%, lines 97.19% (all >=80%).
- Limits: full API suite and unit pool doubles do not prove actual PostgreSQL/RLS, races, rollback, browser mutation or fixture ownership.
