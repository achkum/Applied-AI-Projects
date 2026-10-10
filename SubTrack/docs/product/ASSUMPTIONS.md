# Assumptions & Open Questions

These are decisions made on the founder's behalf. The founder should veto or confirm them before kickoff.
Agents treat an item as **binding** once its status is `Confirmed`, or once it has stayed `Assumed` for 48 h after kickoff with no veto.

| # | Assumption | Why | Status |
|---|---|---|---|
| A1 | The Open book switch is **per member**: it exposes *that member's* subscriptions to the household. It is not a household-wide "everyone sees everything" switch. | Consent must be individual (GDPR, and trust between adults). | Confirmed (founder, 2026-09-26) |
| A2 | Even with Open book ON, raw transactions, balances and non-subscription spend are never shared. | Scope is subscriptions only. | Confirmed (founder, 2026-09-26) |
| A3 | A member can pin individual subscriptions as "Always private", overriding Open book. | Realistic for teens and partners. | Confirmed (founder, 2026-09-26) |
| A4 | Kids are "dependants" without a login, attributable for cost splitting. | Founder said kids are probably not needed as users. | Assumed |
| A5 | BankID runs in `test` mode (real BankID test environment) on staging, and in `simulator` mode for the public demo and App Store review. | Store reviewers can't use a Swedish test BankID. | Assumed |
| A6 | SMS OTP runs in dev-inbox mode until a paid SMS provider is approved. Email OTP uses a free-tier transactional email provider. | SMS costs money (human gate D-09). | Assumed |
| A7 | Monorepo inside `Applied-AI-Projects/SubTrack`, managed with pnpm + Turborepo. The legacy prototype is moved to `SubTrack/_legacy/` and deleted once M1 is done. | Founder: same repo for now. | Assumed |
| A8 | The backend is NestJS + Prisma + PostgreSQL, the ML service is Python/FastAPI, and the workers use BullMQ + Redis. | Structured framework = consistent output across many agents; Python is best for ML. | Assumed |
| A9 | Hosting is Docker Compose on the RackNerd VPS, behind Caddy, with HTTPS on the bare IP via a Let's Encrypt short-lived IP certificate until a domain is bought. | Founder: VPS, no domain yet. | Assumed |
| A10 | Mobile builds use Expo EAS cloud builds (free tier), not the VPS. iOS builds need no Mac. | The VPS can't build iOS. | Assumed |
| A11 | Agent models: Conductor (orchestrator), architects and the security reviewer run on **Sol**. Developers, QA, DevOps, the PO and design run on **Luna**, with an auto-escalation to Sol after repeated failure. | Founder said Sol for the orchestrator and Luna for the others. Architecture and security review on Luna is a quality risk. **Confirmed.** | Confirmed (founder, 2026-09-26) |
| A12 | Default currency is SEK. The architecture supports multi-currency, but the UI doesn't expose it yet. | Sweden-first. | Assumed |
| A13 | The product name stays **SubTrack**. The design concept is "Norrsken". | Continuity. | Assumed |
| A14 | Prices in seeds are illustrative. Only scraper-verified prices are shown as "market prices". | Avoid showing wrong prices as facts. | Assumed |
| A15 | App Store / Play submission is enrolled as an **individual** for the showcase. Moving to an organisation account comes before any public launch with real bank data (see ops/APP_STORES.md §Risk). | Speed now; compliance later. | Confirmed (founder, 2026-09-26) |

## Open questions for the founder (agents: ask via Telegram only if blocked)
- Q1: Which free LLM provider should be first choice: Gemini (AI Studio) or Groq? The default is Gemini first, then Groq, then the template fallback.
- Q2: Should the web app be publicly reachable (with demo mode), or behind basic-auth until v1.0? The default is basic-auth on staging, and demo mode public at v1.0.

## ST126a local duplicate-charge window (Assumed)
This private rule compares already-authorized one-owner posteddebit charges within the same account, merchant andcurrency using exact Money equality. Within3days means UTCcalendar-date difference<=3 inclusive. These conservative local assumptions do notchangeunsafelegacy amountrepresentation orassertST081/ST126integration acceptance. Cross-account rules, exact72-hour interpretation orproductintegration require a reviewedfollow-up.

- ST126b (Assumed, 2026-10-09): "charge after cancellation" uses strict native epoch-millisecond `chargedAt > cancelledAt` against a caller-supplied authoritative confirmed-cancellation effective instant; equal instants are excluded and no grace period is inferred. Caller owns posted debit filtering, transaction/subscription association and one-owner authorization. This private helper does not establish cancellation lifecycle or satisfy ST081/ST126 integration.

- ST126c (Assumed, 2026-10-09): F9.2 amount rule uses ordinary medians (average middle pair for even samples) and unnormalized median absolute deviation; threshold equality is inside. Exact scaled bigint rationals avoid rounding fractional minor units. MAD zero and singleton history follow the literal formula; no production statistical sufficiency is claimed. Caller owns homogeneous service/currency scope, chronological reference history and candidate exclusion. FullST081/ST126 integration remains pending.

- ST126e (Assumed, 2026-10-09): private advisory FX primitive measures effective booked converted cost (includes fees/markup/rounding), using at least4 and at most50 prior eligible paired amounts and strict >5% relative drift from ordinary exact-rational median; exact threshold equality is inside. These are reversible heuristics, not specified or validated production confidence. Valid0..3 references means insufficient evidence (false). Caller supplies authoritative originalUSD/EUR and settledMoney pairs and owns provenance, one-owner/service/currency grouping, chronology, candidate exclusion and posted-debit/refund eligibility. No market-rate-only or source integration claim; fullST081/ST126 remains pending.

- ST126f (Assumed, 2026-10-09): private ID-only converted-cost anomaly input guards bound a batch to1000 unique nonblank transactionIDs (128 UTF16 units), each prior-reference array to0..50 and aggregate references to10000. Fixed CONVERTED_COST_SWING reason and deterministic codepoint/prefix ordering; all Money validation/math and advisory limits inherit ADR0015. Caller owns paired-source provenance/authorization/eligibility/grouping/chronology/exclusion. These are local safeguards, not production source integration or evidence sufficiency beyond ADR0015.

- ST205 (Assumed, 2026-10-09; ADR0016): conservative reversible review semantics use10second server-timed, version-checked compensating undo; same-owner/same-currency DETECTED-only source-to-survivor merge; explicit owner lifecycle table; binary feedback truth separated from edit/merge events; owner/operation/resource-scoped atomic replay and canonical integer-string Money fields. BUG013 dual-key compatibility is already accepted. Feedback/receipt retention/erasure/export/training purpose remains unresolved, and actual principal/RLS/DB/migration proof still blocks implementation; no automatic missed-charge or fullUF06/ST081 completion claim.

- ST083a (Assumed, 2026-10-09; ADR0017): standaloneSEK priceincrease confirmation requires exact same normalizedminor-unit price on the caller-proven next cycle and nonzerocharges; median ofexactly3prior magnitudes, strictabove3% OR500minor-unit increase. Zero-invalid/SEK-only/no repeat tolerance are reversible choices; rawvalues canonicalSEK and bigint only, uniqueMoneyobjects snapshottedonce withboundedaliasmemoization. Caller owns oneowner/service/cadence, posteddebit/refundeligibility, authoritativechronology/exclusion/actualnextcycle. Foreignthresholds/persistedprice_events/fullST083/forecast remainpending; no source/default/API/DB/UIintegration.

- ST-083b (2026-10-10, Assumed): private confirmed-SEK findings use max1000 rows, exact unique nonblank IDs <=128UTF16 units, fixed ID-only reason CONFIRMED_SEK_PRICE_INCREASE, codepoint/prefix sorting, all-or-nothing fixed errors/frozen output. Money snapshots validate history and unique amounts per row; caller owns authorization, eligibility/group/chronology and actual next-cycle provenance. No persistence/default integration.

- ST-081a (2026-10-10, Assumed): private pure getNextSubscriptionStatus accepts exactcase primitive sevenstatuses/sevenlowercaseactions, returns acceptedADR0016 nextstate or fixedError LIFECYCLE_CONFLICT. Localrepresentations only; no currentstate/auth/ownership/replay/atomicity/persistence authority or fullST081 readiness. Edit/merge/undo/automation outsidehelper.
