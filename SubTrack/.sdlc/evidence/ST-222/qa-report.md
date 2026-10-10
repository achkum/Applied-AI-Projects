# ST-222 QA report

Date: 2026-10-10
Verdict: Source and regression checks pass; task DoD is not complete.

## Regression suite

Command: `corepack pnpm --filter @subtrack/api test` from `SubTrack/`, with the required PATH prefix. Exit code: 0. Result: 73 test files passed; 1,467 tests passed.

Raw output was captured to the private, untracked file `SubTrack/apps/api/.coverage-st222/full-api-private.raw.log`. It is retained locally and must not be committed or uploaded because test output may contain synthetic OTP values.

## Changed launcher coverage

Source: `SubTrack/apps/api/.coverage-st222/coverage-summary.json`, exact file entry for `apps/api/src/subscriptions/browser-subscription-read.local.ts`.

- Statements: 86.86% (172/198)
- Branches: 82.09% (133/162)
- Functions: 82.6% (19/23)
- Lines: 94.4% (135/143)

All available changed-launcher metrics meet the 80% threshold.

## Frozen source verification

All eight normalized Git blob hashes in `.sdlc/evidence/ST-222/source-manifest.md` matched both before and after the full API suite. The full suite did not change the frozen source candidate.

## Outstanding blocking evidence

The locally unavailable Docker/psql environment prevented the owned PostgreSQL16 and real-browser proof from running here. Exact-head browser/PostgreSQL CI and the independent final reviews remain blocking. This report therefore records source/regression QA only and does not claim acceptance criteria 1–5 or Definition of Done complete.
