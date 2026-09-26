# Architecture

## 1. System context
```
 iOS / Android (Expo RN) ─┐
                          ├── HTTPS ──> Caddy (TLS, rate limits, security headers)
 Web (Next.js, SSR+PWA) ──┘                 │
                                            ├──> web  (Next.js server, :3000)
                                            └──> api  (NestJS, :4000) ──> PostgreSQL 16 (RLS)
                                                   │    │                    ▲
                                                   │    └──> Redis ──> worker (BullMQ: sync, detection,
                                                   │                           scraping, insights, notifications)
                                                   ├──> ml (FastAPI, internal only, :8000)
                                                   ├──> BankID RP API (test) — mTLS client cert
                                                   ├──> Tink API (sandbox)
                                                   ├──> LLM gateway -> Gemini / Groq / OpenRouter free / Template
                                                   └──> Expo Push, SMTP (email OTP)
```

## 2. Monorepo layout (`SubTrack/`)
```
SubTrack/
├─ apps/
│  ├─ web/            Next.js App Router, React Server Components, next-intl, Framer Motion, TanStack Query
│  ├─ mobile/         Expo (latest SDK), Expo Router, Reanimated, react-native-skia (Orbit), expo-secure-store,
│  │                  expo-local-authentication, expo-notifications, expo-localization
│  └─ api/            NestJS, Prisma, zod validation, pino logs, OpenAPI via contracts package
├─ services/
│  ├─ worker/         BullMQ processors (TS) — shares packages/domain
│  └─ ml/             Python 3.12, FastAPI, statsforecast, scikit-learn, (LightGBM), pydantic; uv for deps
├─ packages/
│  ├─ contracts/      openapi.yaml → generated TS client + zod schemas (single source for API types)
│  ├─ domain/         pure TS: normalisation, merchant matching, recurring detection, visibility policy
│  ├─ money/          pure TS: minor-unit arithmetic, allocation (largest remainder), settlement netting
│  ├─ synthetic/      deterministic data generator + personas
│  ├─ catalog/        merchant/plan seed YAML, scraper source definitions, extractors
│  ├─ llm-gateway/    provider interface + guardrails (numeric post-check)
│  ├─ ui-tokens/      Norrsken tokens (JSON → CSS vars + RN theme)
│  ├─ ui/             web components (+ Storybook); ui-native for RN components
│  ├─ i18n/           sv.json, en.json + key checker
│  └─ config/         eslint, tsconfig, prettier presets
├─ infra/
│  ├─ docker/         Dockerfiles
│  ├─ compose/        docker-compose.{dev,staging}.yml
│  └─ caddy/          Caddyfile (IP cert with shortlived profile)
├─ docs/              product, architecture (ADRs), governance, ops
├─ .sdlc/             board: backlog.yaml, tasks/*.md, reports/
├─ e2e/               Playwright (web), Maestro flows (mobile)
└─ _legacy/           old prototype (deleted after M1)
```

## 3. Key boundaries (enforced by lint rules via `eslint-plugin-boundaries`)
- `packages/domain` and `packages/money` are **pure**: no I/O and no framework imports. They get 100% of the branch coverage target.
- Only `apps/api/src/providers/*` may import provider SDKs or call Tink/BankID. Everything else sees `BankDataProvider` / `IdentityProvider` interfaces.
- Clients (web and mobile) talk **only** to the API, through the generated client. They never call ML, LLM or banks directly.
- `services/ml` is reachable only on the internal Docker network. It has no DB write access; it gets data from the worker and returns results.

## 4. Provider interfaces
```ts
interface BankDataProvider {
  id: 'TINK_SANDBOX' | 'SYNTHETIC' | 'TINK_LIVE';
  listInstitutions(market: 'SE'): Promise<Institution[]>;
  startConnection(userId: string, institutionId: string, redirectUri: string): Promise<{ redirectUrl?: string; handle: string }>;
  completeConnection(handle: string, callbackParams: Record<string,string>): Promise<ConnectionTokens>;
  fetchAccounts(tokens: ConnectionTokens): Promise<ProviderAccount[]>;
  fetchTransactions(tokens: ConnectionTokens, accountId: string, since: Date, cursor?: string): Promise<Page<ProviderTransaction>>;
  refresh(tokens: ConnectionTokens): Promise<ConnectionTokens>;
  revoke(tokens: ConnectionTokens): Promise<void>;
}
interface IdentityProvider { // BankID
  mode: 'test' | 'simulator';
  start(intent, endUserIp): Promise<{ orderRef; autoStartToken; qrStartToken; qrStartSecret }>;
  collect(orderRef): Promise<{ status: 'pending'|'failed'|'complete'; hintCode?; user?: { personalNumber; givenName; surname } }>;
  cancel(orderRef): Promise<void>;
}
```

## 5. Security architecture
- AuthN:
  - BankID-verified accounts.
  - JWT access tokens (EdDSA) valid for 15 min.
  - Refresh tokens rotated with reuse detection.
- AuthZ:
  - Policy functions in `packages/domain/policy`.
  - Postgres RLS, with `app.user_id` set through `SET LOCAL` in a per-request transaction.
- Secrets:
  - `.env` files on the VPS, owned by root, mode 600, and never in git.
  - Future: Docker secrets or sops+age.
  - OpenClaw agents never read production secrets (see governance).
- Field encryption:
  - Provider tokens use AES-256-GCM with a key from `DATA_ENC_KEY`.
  - The personnummer is stored as HMAC-SHA256 with `PNR_PEPPER`.
- Transport: TLS 1.2+ at Caddy, HSTS once a domain exists, strict CSP on web.
- Rate limits:
  - Caddy global limits.
  - The API limits per IP and per identifier for OTP and BankID.
- Audit: a hash-chained `audit_log` for auth, sharing, privacy, household membership, exports and deletions.

## 6. Environments
| Env | Where | Data | BankID | Bank provider |
|---|---|---|---|---|
| local | Agent sandboxes on the VPS | `test`/`dev` seeds | simulator | Synthetic |
| staging | VPS, `https://<IP>/` (basic-auth) | `dev` seed + real sandbox connections | test | Synthetic + Tink Sandbox |
| demo | VPS, same stack, separate DB schema/tenant | `demo` seed | simulator | Synthetic |
| prod | Not yet (post-v1.0) | — | production | Tink Live |

## 7. VPS resource budget (assume 4 GB RAM; adjust after `ops/VPS_SETUP.md` §1 measurements)
postgres 512 MB · redis 128 MB · api 384 MB · worker 384 MB · web 384 MB · ml 512 MB · caddy 64 MB · OpenClaw gateway + agent sandboxes: the remainder.

If RAM is under 4 GB:
- Run Playwright scraping only in a nightly window.
- Keep the ML service scale-to-zero (start on demand).
- Never run heavy builds concurrently with E2E tests (OPERATING_MODEL WIP rules).
