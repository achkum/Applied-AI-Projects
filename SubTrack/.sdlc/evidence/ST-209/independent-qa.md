# ST-209 independent QA and focused coverage

QA scope: independent execution and test inspection for the four source/spec files listed below on `st/ST-209-mobile-enrollment-ports`. No source, task, branch, commit, network, database, provider, or HTTP changes were made. Generated coverage remains in the existing untracked `apps/api/coverage/` directory and is excluded from this evidence.

## Focused execution

Command: `corepack pnpm --filter @subtrack/api exec vitest run src/auth/proofs-v2/otp-proof-producer.spec.ts src/auth/proofs-v2/mobile-enrollment-challenge-store.spec.ts --coverage.enabled --coverage.provider=v8 --coverage.include=src/auth/proofs-v2/otp-proof-producer.ts --coverage.include=src/auth/proofs-v2/mobile-enrollment-challenge-store.ts`

Result: 2 test files passed; 50 tests passed. V8 coverage over both implementations: statements 201/210 (95.71%), branches 254/262 (96.94%), functions 33/33 (100%), lines 163/164 (99.39%). The sole uncovered line is an exceptional input-validation path in the producer. Store line coverage is 100%; its uncovered statement/branch sites are the invalid-capacity constructor condition and the failed active-row lookup branch.

API lint and typecheck both passed via root workspace binaries after package-local script invocation could not resolve binaries in this worktree:

- `corepack pnpm exec eslint "apps/api/src/**/*.ts" "apps/api/test/**/*.ts"` — exit 0.
- `corepack pnpm exec tsc --noEmit -p apps/api/tsconfig.json` — exit 0.

The package-script attempts themselves did not run lint/typecheck because package-local `eslint`/`tsc` command resolution failed. Equivalent workspace binaries completed successfully; Prisma client generation in the package typecheck script completed successfully before its local `tsc` resolution failure.

## Acceptance-focused inspection

- Issuance/consumed tuple coherence: producer spec captures the inserted record, compares all seven issuance values to it, and confirms one consumed outcome among eight parallel correct verifications. The producer copies caller issuance fields before the repository await; a test mutates the caller-owned object during that await and confirms the copied snapshot still verifies.
- Attempts and expiry: producer spec expects remaining attempts 4, 3, 2, 1; the fifth wrong code and subsequent correct code are terminal. Store publication and lookup tests confirm expiry is exclusive at the exact expiry timestamp.
- Clock safety: dedicated regression test drives monotonic time 100 -> 200 in the repository await -> 150 in the proof-store await and expects generic failure; post-proof regression/expiry tests also ensure no proof is disclosed.
- Code boundary and lifecycle: store claim exposes metadata only, lookup and test code peek both return unavailable while claimed, and one parallel capacity contender succeeds. Restore requires a strictly lower attempt count; success/terminal retire behavior and cleanup-fault no-revival are covered. Store publication tests exercise duplicate, malformed/partial, late, regressed and overflow cases without partial metadata/code visibility.
- Legacy behavior: adjacent existing producer tests continue to exercise legacy provision/verify response behavior and bindings; no legacy implementation was changed in the reviewed source.

## Source identity

SHA-256 at QA execution:

| File | SHA-256 |
| --- | --- |
| `apps/api/src/auth/proofs-v2/otp-proof-producer.ts` | `D7ABAA96E5393FBD36AE80A5ABAE67201DCA722015493B2B11B5ACB40AF56D08` |
| `apps/api/src/auth/proofs-v2/otp-proof-producer.spec.ts` | `6DB6509129B23D4293BAC0351E66CF9D66357E8D08199E1D1F2A2183957B00E7` |
| `apps/api/src/auth/proofs-v2/mobile-enrollment-challenge-store.ts` | `2D42D659B56F1EA318019448295A683F7D5A9E3F716710433C1B7FC7256A1511` |
| `apps/api/src/auth/proofs-v2/mobile-enrollment-challenge-store.spec.ts` | `4DFC608D7AA2CF6D00D8C34DEFA4BD61FF69B4AC771F4C7BF765AF161A04ED1C` |

All four hashes match the platform and security review source identity. QA found no reproducible blocker in the scoped producer/store behavior. This is source/test QA only; it does not establish HTTP adapter behavior, idempotency ordering, or exact-head CI.
