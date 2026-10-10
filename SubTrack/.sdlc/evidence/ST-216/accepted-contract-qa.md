# ST-215 final QA v1 — 2026-10-10

Disposition: **PASS for QA and exact-head applicable CI** at PR #244 head `e5f529f4199e3f9f556a67d7b9d95ba0fd6c51ab`. The PR head remained unchanged during this review.

## Contract scope

The final local validation receipt records frozen generation, 11 contract tests passing with zero failures or skips, the generated Zod fixture, Redocly validation, and contracts typecheck as passing. The reviewed final security manifest, platform review, OpenAPI, API contract, ADR, test, and generated output blobs still match their recorded Git blobs at the PR head. This remains a contract-only change; no route, runtime principal binding, database/RLS implementation, or production authority is claimed. The PostgreSQL/runtime workflow is outside this changed-path contract slice and was not expected to trigger.

## Exact-head CI

Both workflow runs report the exact PR head above. SubTrack quality gates passed, including dependency install, lint, typecheck, tests, visual regression, ML endpoint checks, i18n parity, secret scan, and license check. Container image build and isolated smoke test passed. Compose runtime proof passed registry mirror availability, stack startup, service health, followed-log output, volume retention, and cleanup checks.

The first Compose attempt on this head failed at the public registry mirror with a Docker `unknown blob` error before stack startup. The subsequent completed attempt passed all Compose steps listed above. The first failure is retained here as execution history; it does not change the successful final attempt result.

## Gate boundary

This is a QA result for the contract evidence and SubTrack CI runs listed above. Separate Vercel status contexts are present on the PR and are being audited by the Conductor; this report does not classify or waive those statuses. Required reviews and the Conductor's overall PR gate audit remain separate.
