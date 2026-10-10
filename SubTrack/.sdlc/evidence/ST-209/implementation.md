# ST-209 implementation evidence

Base: `3549a845775400c675d5a1711ad3c4c9446e0944` (accepted ST-208 main).

The dedicated mobile producer projects its immutable issuance from the inserted challenge record. Its separate atomic repository method reports incorrect attempts 4 through 1, terminal failure, or consumed success. Verification snapshots the expected issuance before awaits and compares every issued field with the consumed record before issuing an enrollment/mobile/identifier/challenge-bound proof. Mobile-only clock observations are monotonic across calls and awaits; invalid or regressed clocks and expiry after repository or proof-store awaits fail closed. Legacy `provision`/`verify` methods and their outputs remain untouched.

The process-owned store reserves capacity before issuance, counting pending and published entries within 10,000. Publication makes metadata and test-only code visible in one synchronous transition. Lookup and claim expose metadata only. A claim blocks concurrent use; only an explicit decreasing incorrect-code outcome restores it. Retirement removes metadata and code; a failed retirement leaves the claim unusable until expiry. The future HTTPS adapter must own idempotency settlement before calling `publish`, and must retire on terminal, consumed, or ambiguous verification outcomes.

Validation in this worktree:

- `corepack pnpm install --frozen-lockfile --offline`: pass.
- Focused `vitest run ...otp-proof-producer.spec.ts ...mobile-enrollment-challenge-store.spec.ts --coverage`: 50/50 pass. Producer 99.13% lines, 96.92% branches; store 100% lines, 97.01% branches.
- `corepack pnpm --filter @subtrack/api lint`: pass.
- `corepack pnpm --filter @subtrack/api typecheck`: pass.
- `corepack pnpm --filter @subtrack/api test` with Git OpenSSL on PATH: 59 files, 1,206 tests pass after the final changes.

No HTTP, production wiring, provider, database, secret or deployment change is included. Independent platform/security review, QA and exact-head CI remain Conductor gates.
