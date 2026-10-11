# ST-235 C2 actual CI and qualified PG16 QA — APPROVE

PR 280, exact source head `1fec4ecebb7879629c14cc9eab5735e07b984d4b`. This acceptance uses the C2 runs below, not the earlier C1 receipts. The independent C2 source reviews by platform, security and QA approved the corrected source; the C1 security rejection and its quoted `set_config` owner-switch and lock-order findings remain in the review history.

## Actual PostgreSQL proof and source custody

[Foundation run 38128458906](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458906), job `114437642920`, attempt 1 completed **success** on the exact head. The owned PG16/SCRAM stage and custody-negative stage succeeded, followed by the always-run exact-fixture removal step and receipt upload. [Artifact 11698690486](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458906/artifacts/11698690486), `st233a-foundation-1fec4ecebb7879629c14cc9eab5735e07b984d4b`, contains the sanitized 6,243-byte receipt. Its terminal lines are `ST-235 durable current web: PASS` and `ST-233a foundation: PASS source_head=1fec4ecebb7879629c14cc9eab5735e07b984d4b ... fixture=removed secrets=destroyed`. Earlier ST-233l driver and ST-233m port markers also passed; custody negatives explicitly report expected refusal and end in PASS. Their deliberate `FAIL reason=...` diagnostics are negative-case observations, not job failures.

I independently checked all **28** `input/blob/sha256` receipt triples against the `HEAD:path` Git blobs and SHA-256 of those committed LF bytes: zero mismatches, no CRLF in committed bytes. This includes SQL 009 (`2d05cc5fb7b94a8e88df2d7f41ddee6fda5bf487`), adapter (`cf27085f0423e0c461019ff3cc950a27fa04fd21`), fixture (`d498f3404ebcf0b233998ea86eda2983557ddf05`), CSRF (`9ee96a479a7ac8162f3c766cbb5757f8fb5b97c2`), actual integration entry (`99845bbf077248d00c5fe32f9c3a98d589466a93`), and Vitest config (`f70144ef75f915319dc1065ddea6b2ca0cdd2437`). The proof script pins these files before use and checks them again before success. The Windows worktree has CRLF transformations; its raw file SHA-256 is therefore not the runner's LF SHA-256, while Git blob identities match.

The ST-235 marker is from the real sidecar, not a stub: the pinned Node 22 image runs the bundled integration entry beside the owned PG16 fixture with a restricted read-only client container and SCRAM role credentials; the shell accepts only exited-zero custody, unchanged bundle digest and exact Docker log `ST-235 durable current web: PASS`. The entry performs a committed named owner write and rollback; denies unknown and quoted `set_config` operation names and mutable-registry escape; checks A/B owner RLS, invalid claims/origin/binding/chain/CSRF and current witness; proves both held-writer and mutation-first orders for revoke and CSRF replacement; holds fixture epoch against same-owner runtime to check the corrected lock order; checks pool role and both GUC resets after success and denial; starts a fresh process with the same signing key and rejects revoked/predecessor CSRF; withholds successful COMMIT acknowledgment and verifies nondisclosure/no retry; and denies deleted owner, expired CSRF/claim, and default/production construction. The script checks cleanup and secret destruction before the final PASS receipt. This is private development authority proof, not an HTTP signup or production release claim.

## Selected exact-head checks

All **nine selected workflows / ten jobs** completed **success** at this C2 head:

| Workflow run | Job(s) | Result |
| --- | --- | --- |
| [Session owner RLS 38128458915](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458915) | `disposable-session-owner` | success |
| [Owned browser lifecycle 38128458901](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458901) | `owned-browser-proof` | success |
| [Development auth foundation 38128458906](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458906) | `owned-pg16-foundation` | success |
| [Owned browser read 38128458914](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458914) | `owned-browser-proof` | success |
| [SubTrack CI 38128458938](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458938) | `SubTrack quality gates`; `ST-004 Compose runtime proof` | success; success |
| [Subscription lifecycle HTTP PG 38128458931](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458931) | `disposable-http-proof` | success |
| [Subscription read PG 38128458911](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458911) | `disposable-http-proof` | success |
| [Container image proof 38128458916](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458916) | `Build and smoke API and web images` | success |
| [Clean migration PG 38128458922](https://github.com/achkum/Applied-AI-Projects/actions/runs/38128458922) | `disposable-full-chain` | success |

Quality run `38128458938` has a retained **attempt 1 failure** in `Tests`: `browser-subscription-read.composition.spec.ts`, HTTPS parser/content-type mapping, timed out at 5,000 ms; API totals were 1,864 passed and 1 failed. No source edit or timeout change followed. Root dispatched one failed-job diagnostic rerun at the same head. **Attempt 2 passed**: 84 API test files / 1,865 tests, with lint, typecheck, token contrast, Storybook visual regression, ML tests, i18n parity, Gitleaks (`no leaks found`), and license inventory (1,462 packages) all successful. Both quality and Compose jobs are completed success in attempt 2. The first timeout's cause is unproven, so this records the rerun outcome without asserting a flake diagnosis.

QA has no remaining actual-C2 proof or selected-CI blocker. Original `2026-10-11T08:04:01Z` L240 attempt 1/source attempt 1, C1 rejection, and C2 quality attempt 1 failure remain part of the record. External status relevance and branch-protection/merge audit remain with the Conductor.
