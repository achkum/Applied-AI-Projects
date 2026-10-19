# ST249 trusted simulator clock source handoff

2026-10-14. Exactly four frozen source/spec files changed after root/platform and independent privacy PLAN GO. Six stable same-image integration files untouched. No Git, Docker, SQL, hosted dispatch, workspace install or broad test run.

Actual simulator now accepts a constructor-only trusted function clock, default dynamic ()=>Date.now(), and stamps its original verifiedAt using that clock. Nonfunction clock rejects with a fixed unavailable error. DevelopmentEnrollmentPersonVerifier passes only ()=>this.readTime(), retaining finite/nonnegative/Date-safe/monotonic validation before/during/after simulator issuance and all original exact name/identity/HMAC/method/future/age/freshness checks. No posthoc evidence rewrite, global Date patch in fixture, client/env clock parameter, alternate provider or proof/session/epoch/storage/receipt change. HMAC source, key copying and namespace derivation remain unchanged. Other simulator callers retain current wall behavior and legacy result shape/case handling.

Added actual unmocked simulator/verifier regression with trusted time exactly one hour behind real unchanged host wall time; exact controlled verifiedAt, original HMAC/name/method/result shape and immutable verifier output succeed. Default wall calls remain within real before/after bracket. Actual simulator issuance into invalid/throwing/regressing validated time denies without output. Existing hostile/missing/future/stale/age/monotonic/model gates remain exercised.

Focused checks using existing installed direct entries (no pnpm wrapper/install): two changed Vitest files60 tests PASS, enforced100% of65 statements,66 branches,9 functions and51 lines. API direct noEmit TypeScript and four-file scoped ESLint PASS. Exclusive short heavy slot completed and released. Source tests are not an actual PostgreSQL acceptance claim. Independent platform/privacy source review and root curation precede one new-head causal PG run; no blind old-head rerun.

| Git-root-relative path | SHA256 |
| --- | --- |
| `SubTrack/apps/api/src/auth/identity-provider/bankid-simulator.ts` | `6ca9c3f0b431747a834ec17c7bffb9811b576a15f1aa3cd8736337fde9d13ac6` |
| `SubTrack/apps/api/src/auth/identity-provider/bankid-simulator.spec.ts` | `f7fd233d854db509644ae2b17978cfc23936dc053d32d30a615a927a3458812d` |
| `SubTrack/apps/api/src/auth/identity-provider/development-enrollment-person-verifier.ts` | `33c2982c62f441a52f3f92f557760dca320130b60ce660f277577a7235ce969f` |
| `SubTrack/apps/api/src/auth/identity-provider/development-enrollment-person-verifier.spec.ts` | `19a8ec18637f144a83d281fcab5ea23341cc98e38e728ff0dedae31cc5fb300e` |
