# Backlog Seed

The Conductor converts this into `.sdlc/backlog.yaml` and the PO expands each row into a task file.
Size: S ≤ 30 min, M ≤ 2 h, L ≤ 4 h of agent time. Anything larger is split by the PO before READY.

## M0 — Foundation (EP-00)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-001 | Pre-flight report: toolchain, VPS resources, repo access, HUMAN_TODO status | conductor | S | – |
| ST-002 | Move legacy prototype to `SubTrack/_legacy/`; delete nested `SubTrack/SubTrack`, tarballs, `*_payload.json`, `plan_payload.json`; salvage audit hash-chain + consent logic notes into ADR appendix | devops-release | S | ST-001 |
| ST-003 | Monorepo scaffold (pnpm, Turborepo, TS strict, eslint boundaries, prettier, `packages/config`) | architect-platform | M | ST-002 |
| ST-004 | Docker Compose dev stack: postgres16, redis, mailpit, caddy; healthchecks; `make up/down/logs/seed` | devops-release | M | ST-003 |
| ST-005 | CI workflow path-filtered to `SubTrack/**`: lint, typecheck, test, i18n parity, secret scan (gitleaks), licence check | devops-release | M | ST-003 |
| ST-006 | `packages/contracts`: openapi.yaml skeleton + generator (TS client + zod) + contract test harness | architect-platform | M | ST-003 |
| ST-007 | `apps/api` NestJS skeleton: config, pino, problem+json errors, health/version, Prisma init, request-scoped RLS transaction helper | dev-backend | L | ST-006 |
| ST-008 | `apps/web` Next.js skeleton: app router, next-intl sv/en, theme provider (system/light/dark), generated API client wiring | dev-web | M | ST-006 |
| ST-009 | `apps/mobile` Expo skeleton: Expo Router, i18n, theme, secure storage, EAS project config (dev/preview/production profiles) | dev-mobile | M | ST-006 |
| ST-010 | `services/ml` FastAPI skeleton + uv + pytest + Dockerfile; `/healthz`, `/ml/v1/models` | dev-data | S | ST-004 |
| ST-011 | `packages/i18n` catalog structure + parity checker script | dev-web | S | ST-003 |
| ST-012 | `.sdlc/` board initialised from this file; task files for M0/D1/M1 | product-owner | M | ST-001 |

## D1 — Design system Norrsken (EP-01)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-020 | `packages/ui-tokens`: colour/type/space/radius/motion tokens JSON → CSS vars + RN theme; OKLCH category-hue generator; contrast checker in CI | design-lead | L | ST-003 |
| ST-021 | Fonts (Fraunces, Manrope, JetBrains Mono) self-hosted/bundled with OFL notices | dev-web | S | ST-020 |
| ST-022 | Storybook for `packages/ui` + visual regression job | dev-web | M | ST-020 |
| ST-023 | Component specs (markdown) for the 7 signature components | design-lead | M | ST-020 |
| ST-024 | Web: RollingNumber, ScopeSwitcher, ReceiptCard | dev-web | L | ST-023 |
| ST-025 | Web: Orbit (SVG/Canvas) + accessible list fallback | dev-web | L | ST-023 |
| ST-026 | Mobile: RollingNumber, ScopeSwitcher, ReceiptCard (ui-native) | dev-mobile | L | ST-023 |
| ST-027 | Mobile: Orbit with react-native-skia + reduced-motion fallback | dev-mobile | L | ST-023 |
| ST-028 | Hero screens (Welcome, Home, Subscription detail) with mocked data, light/dark, sv/en → G-DESIGN | design-lead + dev-web | L | ST-024, ST-025 |
| ST-029 | App icon, splash, store feature graphic concepts | design-lead | M | ST-020 |

## M1 — Identity & Household (EP-02, EP-03)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-040 | Prisma schema: identity, household, invitation, consent, audit_log + RLS policies migration | architect-platform | L | ST-007 |
| ST-041 | OTP service (email via SMTP/Mailpit, SMS via DevInbox adapter), rate limits, lockout | dev-backend | L | ST-040 |
| ST-042 | IdentityProvider interface + BankID **simulator** (fixed demo identities) | dev-backend | M | ST-040 |
| ST-043 | BankID **test** adapter: RP API v6.0 auth/collect/cancel, mTLS test cert, animated QR (qrStartToken/Secret HMAC), autostart | dev-backend | L | ST-042 |
| ST-044 | Sessions: EdDSA JWT, refresh rotation + reuse detection, device list/revoke | dev-backend | L | ST-041 |
| ST-045 | Security review: auth threat model + review ST-041..044 | security-privacy | M | ST-044 |
| ST-046 | Household module: create, members, dependants, admin transfer, leave/remove, one-admin invariant | dev-backend | L | ST-040 |
| ST-047 | Invitations: link/code/email/SMS, expiry, revoke, preview, accept/decline (idempotent), notifications to admin | dev-backend | L | ST-046 |
| ST-048 | Visibility policy (`packages/domain/policy`) + property tests + RLS parity test | architect-platform | L | ST-040 |
| ST-049 | Privacy: open_book toggle, always_private, "preview as household" endpoint, audit events | dev-backend | M | ST-048 |
| ST-050 | Web flows UF-01..UF-04 | dev-web | L×2 (split) | ST-044, ST-047, ST-028 |
| ST-051 | Mobile flows UF-01..UF-04 incl. BankID autostart deep link return | dev-mobile | L×2 (split) | ST-044, ST-047, ST-026 |
| ST-052 | E2E: Playwright UF-01..04; Maestro UF-01..04 | qa-engineer | L | ST-050, ST-051 |
| ST-053 | Data rights: export job (JSON/CSV zip), account delete with BankID reauth | dev-backend | L | ST-044 |

## M2 — Bank data & Synthetic data (EP-04, EP-05)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-060 | Prisma schema: banking + catalogue + subscription tables | architect-platform | M | ST-040 |
| ST-061 | **Tink capability discovery** (docs + sandbox account): institutions, auth flow, transaction fields, history length, pagination, rate limits → `docs/architecture/TINK_DISCOVERY.md` | architect-platform | M | HUMAN_TODO #1 |
| ST-062 | `packages/synthetic`: generator core, deterministic RNG, Swedish calendar (bank holidays), descriptor variants | dev-data | L | ST-003 |
| ST-063 | Synthetic personas: 5 showcase households + background population; ground-truth labels; snapshot tests | dev-data | L | ST-062 |
| ST-064 | `packages/catalog` seed YAML: ~60 merchants, aliases, ~120 plans (illustrative, sourced) | dev-data | L | ST-060 |
| ST-065 | BankDataProvider interface + SyntheticBankProvider | dev-backend | M | ST-063 |
| ST-066 | TinkSandboxProvider per discovery report (behind interface), encrypted token storage | dev-backend | L | ST-061, ST-065 |
| ST-067 | Ingestion worker: backfill, incremental sync, dedupe, pending→booked, raw payload retention job | dev-backend | L | ST-065 |
| ST-068 | Normaliser + merchant matcher (`packages/domain`) | dev-data | L | ST-064, ST-067 |
| ST-069 | Web + mobile: connect bank, syncing progress, connections list, disconnect/purge | dev-web / dev-mobile | L each | ST-067 |

## M3 — Detection & Core UX (EP-06, EP-07)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-080 | Recurring detection engine (cadence, amount bands, confidence, reasons) + evaluation harness vs synthetic truth | architect-data → dev-data | L×2 | ST-068 |
| ST-081 | Subscription lifecycle + review inbox API + feedback capture | dev-backend | L | ST-080 |
| ST-082 | Dashboard API (scope-aware aggregates, upcoming renewals, deltas) | dev-backend | M | ST-081, ST-048 |
| ST-083 | Price history + price_event detection (deterministic) | dev-data | M | ST-081 |
| ST-084 | Web: Home (Orbit, totals, upcoming), Subscriptions list/filter, Detail (history/charges), Review deck | dev-web | L×3 | ST-082 |
| ST-085 | Mobile: same as ST-084 with swipe review + haptics | dev-mobile | L×3 | ST-082 |
| ST-086 | Manual subscription add/edit | dev-backend + clients | M | ST-081 |
| ST-087 | E2E UF-05..UF-08 + detection quality report | qa-engineer | L | ST-084, ST-085 |

## M4 — Money (EP-08)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-100 | `packages/money`: minor-unit ops, largest-remainder allocation, validation | architect-platform → dev-backend | L | ST-003 |
| ST-101 | Golden money suite (≥60 cases) + fast-check invariants | qa-engineer | L | ST-100 |
| ST-102 | Share/unshare subscription, split rules API with effective dating | dev-backend | L | ST-100, ST-048 |
| ST-103 | Settlement compute (itemised, netting, deterministic tie-breaks), settle, history | dev-backend | L | ST-102 |
| ST-104 | Web + mobile: split editor with live preview, settlement ribbon, history | dev-web / dev-mobile | L each | ST-103 |
| ST-105 | Security + architecture review of money & sharing | security-privacy | M | ST-103 |

## M5 — Intelligence (EP-09, EP-10, EP-11)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-120 | `packages/llm-gateway`: providers (Gemini, Groq, OpenRouter free, Template), numeric post-check, caching, rate limits | dev-data | L | ST-003 |
| ST-121 | Scraper framework (Playwright job, sources.yaml, extractors, LLM fallback, quarantine) + 15 sources | dev-data | L×2 | ST-064, ST-120 |
| ST-122 | Comparison/alternatives API + "Better together" detector | dev-backend | M | ST-121, ST-081 |
| ST-123 | Forecast model + endpoint + backtest report + model card | dev-data | L | ST-083 |
| ST-124 | Classifiers (subscription-vs-not, category) + training pipeline + model cards | dev-data | L×2 | ST-063 |
| ST-125 | Clustering (personas, cohorts, descriptor clusters) + model card | dev-data | L | ST-063 |
| ST-126 | Anomaly rules + optional Isolation Forest | dev-data | M | ST-081 |
| ST-127 | Insights service: generate/store insights, monthly recap narratives sv/en | dev-backend | L | ST-120, ST-123, ST-126 |
| ST-128 | Ask SubTrack: tool-calling over scoped query endpoints, scope refusal tests | dev-backend | L | ST-127 |
| ST-129 | Notifications: Expo push, in-app inbox, email; quiet hours; triggers | dev-backend + dev-mobile | L | ST-083 |
| ST-130 | Web + mobile: Insights, Compare tab, Better together cards, Ask chat, notification settings | dev-web / dev-mobile | L×2 each | ST-127, ST-128 |

## M6 — Mobile parity & polish (EP-12)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-140 | Deep links for invites (custom scheme now; universal/app links when domain exists) | dev-mobile | M | ST-051 |
| ST-141 | Biometric unlock + passkey login option | dev-mobile | M | ST-044 |
| ST-142 | Motion + haptics polish pass; reduced-motion audit | design-lead + dev-mobile | L | M3 |
| ST-143 | A11y pass (VoiceOver/TalkBack scripts) | qa-engineer | M | M5 |
| ST-144 | Performance pass (cold start, list virtualization, image caching) | architect-client | M | M5 |
| ST-145 | Maestro full-regression suite + device matrix | qa-engineer | L | M5 |

## M7 — Hardening & Release (EP-13)
| ID | Title | Owner | Size | Deps |
|---|---|---|---|---|
| ST-160 | Staging + demo deploy on VPS (Compose, Caddy IP cert, basic-auth staging, backups with restore test) | devops-release | L | M1 |
| ST-161 | Monitoring: uptime check, GlitchTip/Sentry, disk/RAM alerts to Conductor | devops-release | M | ST-160 |
| ST-162 | Demo tenant + nightly demo reseed with rolling `asOf` | devops-release + dev-data | M | ST-063 |
| ST-163 | Security & privacy review (ASVS L2 checklist, DPIA-lite, data map, retention jobs verified) | security-privacy | L | M5 |
| ST-164 | Legal pages: privacy policy, terms, in-app licences (sv/en) — drafts for founder review | product-owner | M | ST-163 |
| ST-165 | Store listings: screenshots (6.9"/6.5" iPhone, Android phone), descriptions sv/en, privacy nutrition labels / Data safety form | design-lead + product-owner | L | M6 |
| ST-166 | EAS Build/Submit pipelines: TestFlight + Play internal | devops-release | M | HUMAN_TODO #3, #4 |
| ST-167 | v1.0 gate report + release PR develop → main (D-01) | conductor | M | all |
