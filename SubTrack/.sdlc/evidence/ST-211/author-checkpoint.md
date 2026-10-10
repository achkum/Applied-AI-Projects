# ST-211 author checkpoint 1 — 2026-10-10

- Branch `st/ST-211-mobile-enrollment-routes`, base accepted main `007e620`; no commit/push/PR.
- Read task, AGENTS, Constitution, AGENT_CONTRACTS, ADR-0020, UF-01/02, generated operation descriptors, current routes, design screen spec.
- Implemented draft client, in-memory flow, register/OTP/BankID routes, layout registration. SDK 51 compatible `expo-crypto@~13.0.2` installed with Corepack pnpm.
- Generated types are imported directly to avoid generated SDK client type errors under mobile strict TS. Direct fetch uses exact typed paths/body, explicit fresh async random key, credentials omitted, HTTPS native dev opt-in.
- Root owns shared bilingual catalog addition and root task/backlog updates; those are in shared tree. Own files remain uncommitted.
- Focused mobile typecheck passes after fixes. Tests, lint, parity and coverage remain.
- Current risks to resolve: React navigation back/unmount/reset, client response/status/privacy tests, flow stale completion tests, route rendering tests, UI spec copy detail. No native device claim.
- Original attempt 1; elapsed <30 min; tool-call checkpoint before 20 calls. Next context should inspect git diff and continue tests/verification. Heavy local token assigned by root.

## Author checkpoint 2 — 2026-10-10
- Added route pathname cleanup in EnrollmentProvider, StrictMode mounted rearm, and login mode flow reset/BankID redirect. Added client tests and corrected start 401 classification.
- Focused client test currently fails because Expo's Jest Babel transform replaces dot-syntax `EXPO_PUBLIC_*` reads with `undefined` before per-test env setup. Need arrange env before source transform or test a pure injected config validator; do not change production Expo public-env semantics to bracket access.
- Existing registration test still asserts placeholder behavior and must be updated. Flow/route tests, lint/typecheck/coverage/parity still pending. No commit/push/PR. Native gates still deferred.
- Original attempt 1 counters retained. Approx 18 tool calls this context; rotate now under before-20 rule. Heavy LOCAL token held by ST211 until next author context.

## Author checkpoint 3 — 2026-10-10

- Preserved static `process.env.EXPO_PUBLIC_*` reads for Expo bundling; exposed a configuration-bound client factory so Jest can exercise valid and invalid settings without relying on transformed runtime environment variables. Static native async `getRandomBytesAsync(32)` remains the only key source.
- Updated historical registration test; added client, provider, and actual route tests. Back navigation from BankID to OTP now resets proof. Resend tests cover 30-second cooldown, new challenge and failure reset. No credentials enter URL or storage.
- Before final formatting, full mobile suite PASS 22 suites/127 tests. Scoped changed-source coverage PASS: 87.75% statements, 81.6% branches, 93.1% lines. Mobile lint/typecheck PASS; sv/en parity PASS via `pnpm --filter @subtrack/i18n check:parity`. Existing unrelated `useReducedMotion.test.ts` React `act` warning persists in passing suite.
- Standard Prettier applied to 9 touched source/test files after those checks; format-only output still needs focused verification. New-only files now total ~1,229 lines, exceeding task's <=1,200 nongenerated-line cap before existing-file edits. Conductor asked for narrow amendment before finalization; do not claim compliance until resolved.
- No commit/push/PR. Native device/TLS/provider/delivery proof, design runtime review and independent client/security/QA remain pending. Original attempt/time/failure counters persist; rotate before another heavy job.
