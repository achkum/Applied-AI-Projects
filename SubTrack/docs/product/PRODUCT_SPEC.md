# SubTrack — Product Specification (v2, source of truth)

> Status: APPROVED FOR BUILD · Owner: Founder (Achyuth) · Maintainer: product-owner agent
> Supersedes: `Family_Subscription_Manager_MVP1_Specification.pdf`, [archived plan](../../_legacy/subtrack-plan-rev2.md), [archived UX spec](../../_legacy/subtrack-product-ux-spec.md)

## 1. One-liner
SubTrack shows a household every subscription it pays for, across every bank.
It shows who pays, who shares, what each one is trending towards, and whether there is a cheaper option.

## 2. Problem
- Swedish households pay for subscriptions from 2–6 accounts across several banks and cards. No one sees the total.
- Prices creep up silently: 10–20 SEK a year per service, and sometimes plans are re-tiered.
- Couples and families double-pay. Two individual Spotify plans cost more than one Duo or Family plan.
- Nobody knows who "owns" Netflix, or who should be paying for it.

## 3. Target users (personas)
| Persona | Situation | Job to be done |
|---|---|---|
| **Household Admin** ("Sara", 38, Täby) | Runs the home finances, two kids, three banks | "Show me our total and stop the leaks." |
| **Partner** ("Johan", 40) | Pays some subscriptions from his own account | "Show me what's mine, split fairly, and keep my other spending private." |
| **Young adult at home** ("Elin", 19) | Has her own Spotify and gym | "Don't let my parents see everything, but let them see the phone plan they pay for." |
| **Flat-share** (4 roommates) | Share broadband, streaming, cleaning service | "Split it, and tell me who owes whom this month." |
| **Solo** ("Amir", 29) | Single, 14 subscriptions, 2 banks | "Which of these am I wasting money on?" |

## 4. Scope rules
- **In scope:** recurring *subscription* payments only. That includes digital services, memberships, telecom and broadband plans, recurring app-store billing, recurring donations, and subscription boxes.
- **Out of scope (for now):** general spending, groceries, rent, mortgage, loans, insurance premiums, electricity bills, salary, transfers, payment initiation, Swish, automatic cancellation, and financial advice.
  - The detection engine must still *recognise* those items so it can exclude them.
- **Live banking:** Tink Sandbox and a Synthetic provider only. Live Tink comes later through the same provider interface.

## 5. Platforms
| Surface | Tech | Notes |
|---|---|---|
| Web app | Next.js (App Router), responsive, installable PWA | Full feature parity. Desktop gets richer analytics layouts. |
| iOS app | Expo / React Native, built with EAS | Published to TestFlight, then the App Store. |
| Android app | Expo / React Native, built with EAS | Published to the Play internal track, then closed testing, then production. |
| API | NestJS (TypeScript) + PostgreSQL | One API for all clients. The contract is OpenAPI-first. |
| ML service | Python (FastAPI) | Forecasting, classification and clustering. Never does money arithmetic. |

## 6. Feature catalogue (with IDs used in the backlog)

### F1 Identity & onboarding
- **F1.1 Register** with email *or* Swedish mobile number, verified with a 6-digit OTP.
- **F1.2 BankID step** is mandatory for every account.
  - Modes: `test` (the real BankID test environment with a test BankID) and `simulator` (a built-in BankID-look-alike screen for demos and store reviewers).
  - The mode is set per environment.
  - It binds a verified identity: name, and a hash of the personnummer. The personnummer is never stored in plaintext.
- **F1.3 Login** with BankID (primary), or with email/phone OTP plus a device passkey or biometrics on mobile.
- **F1.4 Onboarding choice:** "Just me" or "My household". This can be changed later.
- **F1.5 Profile:** display name, avatar colour/emoji, language (sv/en), theme (system/light/dark), currency (SEK by default; architecture is multi-currency ready).
- **F1.6 Sessions & devices:** list and revoke active devices.
- **F1.7 Account deletion & data export** (GDPR Art. 17/20). Export is JSON and CSV.

### F2 Household
- **F2.1 Create household** (name, emoji/cover). The creator becomes the **Admin**. Exactly one Admin per household.
- **F2.2 Invite members** by link, 6-character code, email, or SMS.
  - Invites expire after 7 days.
  - The Admin can revoke pending invites.
- **F2.3 Accept or decline:** the invitee lands on an invite screen.
  - If they have no account, they register (F1.1 + F1.2 BankID) first.
  - They then choose **Join** or **Decline**. The Admin is notified either way.
- **F2.4 Roles:** `ADMIN` and `MEMBER`.
  - The Admin can remove members, transfer the Admin role, rename the household, and delete it.
  - Members can leave.
- **F2.5 Dependants (non-login members):** the Admin can add a "profile only" member (for example a child). This lets costs be attributed to them without them having an account.
- **F2.6 Unlimited members** (soft cap 20 per household for abuse control).
- **F2.7 Multiple households per user** is supported by the data model. The UI exposes one active household plus a switcher.

### F3 Privacy
- **F3.1 Personal privacy switch ("Open book"), per member, default OFF.**
  - OFF: household members see only the subscriptions this person has explicitly **shared**.
  - ON: every subscription this person has becomes visible to the household (read-only to others).
- **F3.2 Per-subscription override:** any subscription can be pinned to "Always private", even when Open book is ON.
- **F3.3 What is never shared:** raw transactions, account balances, non-subscription transactions, full account numbers (only the last 4 digits), and the personnummer.
- **F3.4 Transparency:**
  - A "What others can see" preview screen.
  - Every sharing change is written to an audit log that the member can view.
- **F3.5 Admin has no super-powers over privacy.** The Admin cannot force a member's Open book on.

### F4 Bank connections
- **F4.1 Connect a bank** through the Tink Link flow (sandbox) or the Synthetic provider ("Demo bank").
- **F4.2 Multiple connections per user** (for example SEB + Revolut + Amex). Each connection is private to its owner.
- **F4.3 Sync:**
  - Initial backfill of up to 24 months (the provider may limit this).
  - Daily background refresh.
  - Manual "Refresh now".
  - Consent expiry is tracked, with a re-consent prompt.
- **F4.4 Disconnect:** revoke the connection and optionally purge its data.
- **F4.5 Manual subscription:** the user can add a subscription that bank data can't see, such as one paid by invoice or a partner's card.

### F5 Subscription detection & catalogue
- **F5.1 Normalise transactions** into the canonical model (see DATA_MODEL.md).
- **F5.2 Merchant normalisation:**
  - First, a deterministic rules and alias table (`NETFLIX.COM`, `NETFLIX INTERNATIONAL B.V.` → Netflix).
  - Second, ML/LLM suggestions queued for review.
- **F5.3 Recurring detection** uses merchant, amount band, cadence (weekly, monthly, quarterly, semi-annual, annual), day-of-month stability, occurrence count, and category priors.
  - Each detection gets a confidence score and human-readable reasons.
- **F5.4 Review inbox:** new detections appear as cards with actions Confirm / Not a subscription / Edit / Merge.
  - Swipe gestures on mobile.
- **F5.5 Subscription lifecycle:** `DETECTED → ACTIVE → (PAUSED) → CANCELLED`, plus `TRIAL` and `ARCHIVED`.
  - It is marked Cancelled automatically when a charge is missed for more than 1.5× the cadence, and the user confirms.
- **F5.6 Categories:** see CATEGORIES.md (Swedish-market taxonomy, 20 top-level categories).
- **F5.7 Plan recognition:** match the amount against the catalogue to guess the plan (for example Netflix Standard vs Premium).

### F6 Household view & filtering
- **F6.1 Global scope switcher**, present on every screen: **Me · Household · [Member chips]**.
  - Remembered per device.
- **F6.2 Household totals:**
  - Monthly, annual, and projected 12-month totals.
  - Split into "shared" vs "personal but visible".
- **F6.3 By-member breakdown:** who pays, who benefits.
- **F6.4 Upcoming renewals calendar** (next 30 days, with a month view).

### F7 Splitting & settlement
- **F7.1 Ownership vs payer:**
  - `owner_type` is PERSONAL or SHARED.
  - `payer` is the member whose account is charged.
  - `beneficiaries` are the members who use it.
- **F7.2 Split rules:** Equal, Percentage, Fixed amount (with a remainder), Custom per member, and Exclude member (for example a child pays 0).
- **F7.3 Monthly settlement:** "Johan owes Sara 239 kr for September". Settlements are deterministic, minimise the number of transfers, and are itemised.
- **F7.4 Mark settled** (manually, with an optional note). No money movement.
- **F7.5 Settlement history.**

### F8 Price intelligence
- **F8.1 Price history per subscription**, built from its actual charges. Shown as a step-chart with annotated changes.
- **F8.2 Price-hike detection:** a charge more than 3% or 5 SEK above the previous stable price triggers a "Price went up" event and a notification.
  - It shows the annualised impact.
- **F8.3 Market comparison:** for each subscription, show alternatives in the same category from the **Price Catalogue**.
  - Example: Spotify Individual vs Spotify Duo vs YouTube Music vs Apple Music.
  - Shows the monthly and annual delta.
  - Shows a "last verified" date and the source link.
- **F8.4 Household optimisation ("Better together")** detects:
  - N individual plans of the same service in one household, and suggests the family/duo plan with the saving.
  - Overlapping services within one category (for example three video services). Usage isn't known, so this is phrased as a question, not a claim.
- **F8.5 Price Catalogue:** a curated seed plus a scheduled scraper of official Swedish pricing pages (see AI_ML_SPEC.md §4).

### F9 Insights (AI/ML)
- **F9.1 Spend forecast:** a 12-month forecast of recurring spend per scope, with an uncertainty band (time-series).
- **F9.2 Anomalies:** unexpected charge amounts, double charges, and charges after a cancellation.
- **F9.3 Classification:** a merchant/transaction → category and subscription-vs-not classifier (assists the rules).
- **F9.4 Clustering:**
  - Group subscriptions into "spend personas" (for example "Entertainment-heavy", "Productivity stack").
  - Cluster households (anonymised, synthetic cohort) for "households like yours spend X on streaming".
- **F9.5 Natural-language explanations & monthly recap** (LLM).
  - It only verbalises numbers computed by deterministic code.
  - It never computes them.
- **F9.6 Ask SubTrack:** natural-language questions over the user's *own visible* data (for example "What did we spend on streaming this year?").
  - Implemented as tool-calling into deterministic query endpoints.
  - The LLM never sees data outside the caller's scope.

### F10 Notifications
- Push (Expo), in-app inbox, and optional email.
- Triggers:
  - Renewal in 3 days (annual plans).
  - Price increase.
  - New detection to review.
  - Invite events.
  - Settlement ready.
  - Consent expiring.
- Quiet hours and per-type toggles.

### F11 Settings & trust
- Language: Swedish/English, with all strings externalised. Dates, numbers and currency follow `sv-SE` / `en-SE`.
- Theme: System / Light / Dark.
- Accessibility: Dynamic Type, reduced motion, screen-reader labels, and WCAG 2.2 AA contrast.
- Data & privacy centre: connections, consents, audit log, export, delete.
- About, open-source licences, privacy policy, terms.

### F12 Demo & showcase mode
- **"Explore with demo household"** from the welcome screen. It loads a rich synthetic household (Familjen Lindqvist) read-only in an isolated tenant.
- This is required for App Store review and for pitching.

## 7. Non-functional requirements
| Area | Requirement |
|---|---|
| Performance | Dashboard: p95 API < 300 ms on the VPS. Web LCP < 2.0 s on 4G. Mobile cold start < 2.5 s on a mid-range Android. |
| Reliability | Sync jobs are idempotent and retried with backoff. No duplicate transactions: the key is `(connection_id, provider_txn_id)`. |
| Security | OWASP ASVS L2 target. Argon2id for secrets. AES-256-GCM field encryption for provider tokens. HMAC-SHA256 (with a server pepper) for the personnummer hash. TLS everywhere. |
| Privacy | GDPR: data minimisation, purpose limitation, and a retention policy (raw provider payloads purged after 30 days). Consent is recorded and versioned. |
| Tenancy | Every query is scoped by `user_id` / `household_id` at the repository layer, with PostgreSQL Row-Level Security as defence in depth. |
| Money | Integer minor units (öre) plus an ISO currency. Deterministic code only. Allocation uses the largest-remainder method with a deterministic tie-break. |
| i18n | 100% string coverage in sv and en. CI fails on a missing key. |
| Accessibility | WCAG 2.2 AA. Automated axe checks on web; manual VoiceOver/TalkBack pass per release. |
| Observability | Structured JSON logs with no PII, request IDs, a health endpoint, an uptime check, and error tracking (self-hosted GlitchTip or Sentry free tier). |

## 8. Success criteria (showcase-ready = "v1.0 Showcase")
1. A new user can register on iOS, Android and web with email/phone, OTP and BankID (test *or* simulator), in under 3 minutes.
2. The Admin creates a household and invites 2 people. One accepts (with BankID) and one declines. The Admin sees both outcomes.
3. Each member connects 1–3 sandbox/synthetic banks. At least 25 subscriptions per demo household are detected with ≥ 90% precision and ≥ 85% recall on synthetic ground truth.
4. The Me/Household filter works on every screen, and the privacy switch visibly changes what others see.
5. Splits and settlement are correct for every case in the golden test suite (100% pass).
6. Price history, hike alerts, market comparison and the "Better together" suggestions all work on demo data.
7. The forecast, anomaly, classification and clustering features are visible, explained, and backed by a model card.
8. Swedish/English and light/dark mode are complete. The founder signs off the design as "not like other apps".
9. Web is live on the VPS over HTTPS. iOS is on TestFlight. Android is on the Play internal track.
10. The security/privacy review is signed off, with no open High findings.
