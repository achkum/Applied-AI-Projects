# Roadmap & Milestones

Milestones are **gates, not dates**. Each has exit criteria that QA verifies and the Conductor reports to the founder.
Parallel lanes run once M0 is done. The WIP limit is in OPERATING_MODEL.md.

```
M0 Foundation ──┬─> M1 Identity & Household ───────────┐
                ├─> M2 Bank data & Synthetic data ──> M3 Detection & Core UX ──> M4 Money ──┐
                └─> D1 Design system (Norrsken) ─────────────────────────────────────────────┤
                                                    M5 Intelligence (after M3) ───────────────┤
                                                    M6 Mobile parity & polish (continuous) ───┤
                                                                                   M7 Hardening & Release
```

## M0 — Foundation
- Install the kit. The repo audit moves the legacy code to `_legacy/` and removes junk (the nested `SubTrack/SubTrack`, the tarballs, and the `*_payload.json` files).
- Scaffold the monorepo:
  - `apps/web`, `apps/mobile`, `apps/api`, `services/ml`, `services/worker`
  - `packages/{contracts,domain,money,ui-tokens,ui,i18n,synthetic,catalog,llm-gateway,config}`
- CI (GitHub Actions, path-filtered to `SubTrack/**`): lint, typecheck, unit tests, i18n check, contract check, secret scan, license check.
- Docker Compose dev stack: postgres, redis, api, web, ml, worker, caddy, mailpit.
- Governance files live in the repo, and the `.sdlc/` board is initialised.
- **Exit:** `pnpm i && pnpm check` is green; `docker compose up` gives healthy services; ADR-0001..0008 are merged; the founder has received the first status report on Telegram.

## D1 — Design system "Norrsken" (parallel with M1/M2)
- Tokens, typography, colour generator, the 7 signature components as Storybook stories, and the 3 hero screens in light and dark mode.
- **Exit:** Gate G-DESIGN, i.e. founder approval via Telegram (screenshots sent).

## M1 — Identity & Household
- F1 (register, OTP, BankID test + simulator, profile, sessions), F2 (households, invites, accept/decline, roles, dependants), F3 (privacy + visibility policy + audit), F11 basics (language/theme).
- **Exit:** UF-01…UF-04 pass E2E on web; the visibility-policy property tests pass; the security review of the auth flows has no High findings.

## M2 — Bank data & Synthetic data
- The `BankDataProvider` interface, `SyntheticBankProvider`, and the `TinkSandboxProvider` (after the Tink capability discovery report).
- Ingestion jobs, normalisation, the merchant catalogue seed, and the synthetic generator with all 5 personas.
- **Exit:** UF-05 passes with both providers (Tink only if credentials exist; otherwise Synthetic, and Tink is marked blocked on HUMAN_TODO); the generator is deterministic (snapshot tests).

## M3 — Detection & Core UX
- F5 detection engine + review inbox, F6 dashboard + scope filter + Orbit, F8.1 price history, and subscription detail.
- **Exit:** detection precision ≥ 0.90 and recall ≥ 0.85 on the synthetic truth; UF-06…UF-08 pass on web.

## M4 — Money
- F7 split rules, settlement, and history.
- **Exit:** the golden money test suite passes 100% (≥ 60 cases, including property-based tests); UF-09 passes.

## M5 — Intelligence
- F8.2–F8.5 (hikes, comparison, Better together, catalogue + scraper), F9 (forecast, anomalies, classification, clustering, recap, Ask), F10 notifications.
- **Exit:** model cards are published; the ML metrics meet the AI_ML_SPEC targets; the LLM numeric post-check has 100% test coverage; the scraper has run on ≥ 15 sources.

## M6 — Mobile parity & polish (starts after M1; continuous)
- Expo app with every flow, push notifications, deep links for invites, biometrics, haptics, and the Orbit in Skia.
- i18n at 100%, a11y pass, motion polish.
- **Exit:** every UF passes on the iOS simulator and an Android emulator (Maestro E2E); the founder has done a TestFlight dogfood run.

## M7 — Hardening & Release ("v1.0 Showcase")
- Security & privacy review, performance budget, backups, monitoring, legal pages (privacy policy, terms), store listings, screenshots, the demo tenant.
- Deploy to the VPS; submit to TestFlight external testing and the Play internal/closed track.
- **Exit:** PRODUCT_SPEC §8 success criteria are all green, and the founder signs off.

## Beyond v1.0 (not planned in detail; do not build)
- Live Tink (commercial agreement), a domain + organisation developer accounts, company formation.
- Cancellation assistance, multi-market (NO/DK/FI), B2B2C with banks, premium tier.
