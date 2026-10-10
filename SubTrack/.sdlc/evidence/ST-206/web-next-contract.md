# SubTrack web onboarding readiness: UF-01/02

Repository: `/workspace/Applied-AI-Projects/SubTrack`

## Sources checked

- `AGENTS.md`, `apps/web/AGENTS.md`
- `docs/governance/CONSTITUTION.md`, `docs/governance/DECISION_RULES.md`
- `.sdlc/tasks/ST-050.md`, `.sdlc/tasks/ST-050a.md`
- `docs/product/USER_FLOWS.md` UF-01 and UF-02
- The locale welcome route and screen, existing identifier component, and the relevant OpenAPI/generated auth-client contract

## Current UI and reusable component

- `/[locale]` is served by `apps/web/app/[locale]/page.tsx`, which renders `WelcomeScreen` from `apps/web/app/[locale]/welcome-screen.tsx`. Welcome currently shows the SubTrack wordmark, tagline, and demo link only. The existing styling is in `welcome-screen.module.css` and uses theme tokens.
- `IdentifierEntry(locale, onContinue)` at `apps/web/components/onboarding/identifier-entry.tsx` is a completed callback-only composition. It normalizes and validates email/phone, provides bilingual channel/input/error labels, and does not call the API or claim authentication. Its styles/helper are `identifier-entry.module.css` and `apps/web/lib/onboarding-identifier.ts`.
- Existing catalogues are `packages/i18n/catalogs/{en,sv}.json`; locale and theme providers are already installed by `apps/web/app/[locale]/layout.tsx`.
- There are no current register, OTP, BankID, profile, onboarding-mode, or household routes/components in `apps/web/app`.

## Verified API boundary

`packages/contracts/openapi.yaml` and its generated SDK define:

- `POST /v2/auth/browser-nonce`: purpose-bound browser nonce plus a distinct HttpOnly binding cookie; requires exact configured Origin and Idempotency-Key.
- `POST /v2/auth/otp/start`: generic 202 challenge response, not proof of delivery or account selection; requires browser cookie, exact Origin, `X-Browser-Nonce`, and Idempotency-Key. The response rotates the public nonce.
- `POST /v2/auth/otp/verify`: one-use, five-minute restricted proof; enrollment proof permits only mandatory BankID continuation. It is not a login/session proof. The request has `challengeId`, `code`, and `transport`; response returns proof and rotated nonce.
- `POST /v2/auth/session`: redemption only accepts a trusted server-produced login proof. The contract says BankID/passkey proof producer integration is a prerequisite and explicitly says this does not claim client readiness. On successful web redemption the browser nonce chain terminates and a distinct session CSRF token is returned; auth cookies are HttpOnly.

The API contract has no BankID continuation/status endpoint or proof producer, profile-save endpoint, onboarding-mode endpoint, or household-create endpoint. A source search found no corresponding service implementation. Therefore the contracted OTP endpoints alone cannot complete UF-01/02, and no client-generated BankID result, locally invented provider endpoint/payload, fake household state, or “signed in” claim is valid.

The browser nonce is not an auth token. Do not put OTPs, proofs, session credentials, or binding material in localStorage, URLs, logs, analytics, or UI text. Use only browser cookie transport (`credentials: include`) and the configured API origin; do not echo identifiers. Handle `409 AUTH_RESTART_REQUIRED` by restarting with a fresh nonce chain, never by retrying a consumed OTP/proof. Treat generic 202 as “request accepted” without claiming delivery.

## Smallest useful next UI slice

Subject to a root-recorded ST-050 child contract/assumptions and the applicable route allowed-path check, the smallest meaningful UI slice is to mount the accepted `IdentifierEntry` in a real localized register route and provide a visible localized callback-controlled OTP-entry state. It can be genuinely wired through nonce bootstrap, OTP start, and OTP verify only if the implementation uses the generated contract and preserves nonce/cookie/Origin/idempotency invariants. Verified OTP must be described only as enrollment proof awaiting mandatory BankID. Keep BankID, profile/mode, and household creation as explicit blocked continuations until their API contracts and server implementations exist; do not present the flow as complete or deploy-ready.

Suggested narrow web paths for that slice (the parent ST-050 contract currently permits all `apps/web/**`):

- `apps/web/app/[locale]/register/page.tsx` and route-owned screen/style, or an equally route-usable localized route selected by the conductor.
- `apps/web/components/onboarding/identifier-entry.tsx` only if an integration defect needs a fix; otherwise reuse as-is.
- A narrowly scoped web onboarding API adapter/state component under `apps/web/lib/` and `apps/web/components/onboarding/`.
- Bilingual catalogue keys in `packages/i18n/catalogs/en.json` and `sv.json` require a separately authorized task-path expansion because ST-050 `allowed_paths` is only `apps/web/**`.

Do not modify `packages/contracts`, server code, public design tokens/components, existing approved welcome design, or other routes under the proposed narrow contract without an expanded task contract. The Next.js guide requirement in `apps/web/AGENTS.md` must be satisfied before any web code is written.

## Gates for the parent task

1. Root records the narrowed child contract and assumptions, including the catalogue-key path expansion and the exact behavior allowed before BankID/profile/household APIs exist.
2. Implement only contract-backed states; label BankID continuation as unavailable/pending and do not mark UF-01/02 complete.
3. UF-01 completion remains blocked on a documented BankID simulator/real-provider contract and server proof producer. UF-02 completion remains blocked on profile/mode and household-create API contracts and service behavior.
4. Parent ST-050 remains IN_PROGRESS until all its acceptance criteria can run through real supported endpoints and required reviews/QA are supplied.

This is an implementation contract/readiness note, not evidence that a route or flow was built or tested.
