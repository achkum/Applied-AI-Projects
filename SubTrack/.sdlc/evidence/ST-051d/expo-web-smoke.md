# ST-051d clean-mainline QA — 2026-10-10

## Static and component verification

- Full mobile Jest suite: 19 suites, 106 tests passed.
- Mobile ESLint and TypeScript checks passed.
- Swedish/English catalog parity passed through `corepack pnpm --filter @subtrack/i18n exec node scripts/check-parity.mjs`.
- The workspace `i18n:check` alias is not defined in the current package manifests. The i18n package's `lint` wrapper calls bare `pnpm`, which is unavailable on this Windows shell; invoking its parity script through Corepack succeeded.

## Expo Web runtime verification

The initial Windows Expo Web attempts failed before app startup: the first URL contained encoded parent separators and returned 404; a subsequent entry-bundle resolution attempt also returned 404. Those failures are retained in the run history. After the app entry and Metro root configuration corrections, the rerun succeeded.

The Expo SDK 51 server was started from `apps/mobile` on port 8091. The smoke harness is [expo-web-smoke.cjs](./expo-web-smoke.cjs); its machine-readable current result is [expo-web-smoke.json](./expo-web-smoke.json). It passed four contexts (English and Swedish, light and dark) at 375×812, exercising welcome, registration, locally validated identifier with unavailable continuation, enum-only login-unavailable, and locale-specific demo routes. The real screen background differed by theme. It observed 48 requests, zero external requests, zero auth/OTP/session/BankID requests, zero requests containing the entered identifier, and zero page errors. Twenty route screenshots were saved. The harness's heading and background checks now target the actual rendered Expo Web semantics.

The Expo server was stopped after the successful run. This confirms the observed web route and privacy behavior only; it does not claim signup authority, backend behavior, or native accessibility. Native Android/iOS device and screen-reader QA were not run and remain deferred.
