# C8 enrollment checkpoint author receipt
- Added fixed main-stage checkpoints to the existing full integration proof; no case, assertion, helper, configuration, or success marker was removed.
- Failure stderr is exactly `ST-236 enrollment checkpoint: FAIL stage=<fixed-enum>\n`, after enum validation; caught error content is never printed.
- Stages: entry, fixture-qualification, otp-cases, wrong-code, first-account, restart, old-id, active-subject, contact-race, subject-race, unknown-commit, deleted-subject, erasure, pool-reset, restart-child.
- `main()` rejection still sets exit code 1 and ends both pools; success remains exactly `ST-236 durable enrollment: PASS\n`.
- Focused ESLint passed. `pnpm` was unavailable on PATH; direct local ESLint binary ran successfully.
- Checkpoint change is static-only evidence; actual PG16 proof, both jobs, source reviews, QA and CI remain required before merge.
