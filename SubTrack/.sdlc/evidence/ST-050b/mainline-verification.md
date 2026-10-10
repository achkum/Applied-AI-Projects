# ST-050b mainline verification — 2026-10-10

Base commit: `f692b97` (`origin/main`). The extracted ST-050b web implementation was checked in place; no source, task, catalog, or backlog files were changed during QA.

## Checks

| Command | Result |
|---|---|
| `corepack pnpm --filter @subtrack/web test` | PASS — 138 tests across 11 files |
| `corepack pnpm --filter @subtrack/web lint` | PASS |
| `corepack pnpm --filter @subtrack/web typecheck` | PASS |
| `corepack pnpm --filter @subtrack/web build` | PASS — generated `/sv/register` and `/en/register` routes |
| `corepack pnpm --filter @subtrack/i18n exec node scripts/check-parity.mjs` | PASS — Swedish and English nested keys, value shapes, and ICU placeholders match |
| Built-route browser QA (`browser-qa.cjs`, run from a temporary copy to keep repository evidence unchanged) | PASS — sv/en × light/dark, 375×812; no page errors or horizontal overflow |

Browser QA used the built app served locally at `127.0.0.1:3100`. OTP calls were mocked; the successful verification state and fresh-chain restart state were exercised for each locale/theme combination. No screenshots or result JSON were written into the repository by this rerun.

The build reports the existing Next.js middleware convention deprecation. The web app uses `output: standalone`; `next start` also prints its standalone guidance warning, though it served the hydrated route successfully for the established local browser harness. No configuration changes were made.

This verifies local web behavior only. It does not establish reverse-proxy or HTTPS routing, backend delivery, BankID/profile/household continuation, or completed onboarding. ST-050b and parent ST-050 remain `IN_PROGRESS`; those runtime and review gates remain open.