# ST-050b desktop continuation — 2026-10-10

Base: desktop handoff `st/ST-206-deployment-images`, commit `f8a7340ebfb98b14697b9c1d63470356d9eaaa8c`. This focused continuation preserves the unaccepted container and mobile work. It does not merge those tasks into main.

## Implemented

- Strict local response decoders mirror the generated closed BrowserNonceResponse, OtpStartResponse and OtpVerifyResponse schemas. They return generated types after validation; contracts exports and dependencies are unchanged. Web enrollment requires a nonempty successor nonce and enrollment-purpose proof.
- Exact expected HTTP success statuses (200/202/200), JSON media types, and a 32 KiB limit on actual streamed bytes before parsing. Oversized/malformed/aborted bodies fail closed; overflow and abort cancel the reader. A complete matching RFC problem is required to classify AUTH_RESTART_REQUIRED.
- Each verification clears local OTP/challenge/nonce before dispatch. Every current verification failure requires fresh bootstrap/challenge, including ordinary invalid-code and network failures. No consumed one-use credential is retried.
- A synchronous ref lock excludes repeated submissions before React commits busy state. Back remains available during pending verification and invalidates/aborts the old generation. Late responses cannot change the newer flow.
- Actual IdentifierEntry/Button components replace registration-test mocks. API tests cover malformed shapes, statuses, body/media errors, size/byte boundaries, cancellation, request fields, nonce rotation and idempotency. Component tests cover both languages, axe, restart, privacy and races.

## Local verification

| Check | Result |
|---|---|
| pnpm install --frozen-lockfile --filter @subtrack/web... | PASS; pnpm 12.6.0, Node 24.14.0; no lockfile changes |
| Full web Vitest suite | PASS: 137 tests, 11 files |
| Focused registration suite | PASS: 43 tests, 2 files |
| Web ESLint and strict TypeScript | PASS |
| Web production Next build | PASS; both localized register routes generated |
| i18n parity | PASS |
| Built-route browser QA | PASS: sv/en × light/dark, 375×812 viewport; OTP calls mocked |
| Browser page errors / horizontal overflow | None in the four checked combinations |

See `browser-qa.cjs`, `browser-qa.json` and the eight OTP/restart screenshots. Root visually inspected representative states in all four locale/theme combinations. Server was local only at 127.0.0.1:3100; no deployment occurred. Browser QA ran against the built web app via Next start, not a container. It does not verify standalone-image runtime.

## Independent reviews

- Fresh architect-client/security plan reviewer: APPROVE the local decoders, streaming cap and conservative restart/locking changes before implementation. Specifically confirmed nonce consumption precedes verification and a fresh chain is required after ordinary invalid-code failures.
- Fresh independent architect-client/security source reviewer: APPROVE; no blocker or actionable minor found. Inspected source/tests against generated schemas. Review excludes backend/proxy/production readiness.
- Fresh QA/design reviewer: APPROVE bounded client regression and visual evidence after reading scripts/tests/JSON and inspecting sv-light-restart, sv-dark-otp, en-light-otp, en-dark-restart screenshots. No overflow/material visual regression found. Component tests render RegistrationFlow; actual route coverage is from browser QA. No native/backend/full-UF claim.

## Provenance and remaining gates

Runtime source SHA256 (bytes tested/built and reviewed):

- `apps/web/lib/registration-api.ts`: `a5d8f5d10196a843dbf9270293a1b19d24c8eb54c596142bd8c8038f0f990078`
- `apps/web/components/onboarding/registration-flow.tsx`: `7ba1fb1ba0b4ca52d1b37f2469ad81d8b6bad27c8bc5a94e9919d594bbe6ec84`

ST-050b and parent ST-050 remain IN_PROGRESS. Actual HTTPS/proxy routing, opted-in backend acceptance, BankID/profile/household continuation and full onboarding remain pending. Full CI, required secret/licence/bundle gates and measured changed-file coverage are not established by these local checks; no merge or release approval is claimed. Gitleaks and Docker are not installed on this desktop. Next reports existing middleware deprecation and standalone-start guidance; no unrelated configuration changes were made.

The required workflow task_guard was attempted but fails at import on native Windows because `fcntl` is unavailable. No retry or tool-source modification was made. The bounded continuation ran within its M (2 h) budget; local progress and review results are recorded here. Initial test typecheck exposed unsupported matcher declarations; assertions were corrected and final lint/typecheck/build/tests passed. No tests were skipped and no thresholds, auth opt-ins, migrations or governance were changed.
