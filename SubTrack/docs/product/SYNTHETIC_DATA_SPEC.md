# Synthetic Data Specification ("production-like" data)

Goal: the app should look and behave like it has real users, with rich, messy, realistic Swedish banking data. It also provides **ground truth** for testing detection and ML.

## 1. Generator
- Package: `packages/synthetic` (TypeScript). The output is consumed by `SyntheticBankProvider` and by the ML training scripts (JSONL export).
- **Deterministic:** `generate({seed, households, months, asOf})`. The same seed always gives byte-identical output. Snapshot tests enforce this.
- Every generated transaction carries hidden ground-truth labels: `truth.subscription_key`, `truth.category`, `truth.is_subscription`.
  - These are stored only in the synthetic fixture files, never in the API responses.

## 2. Showcase households (hand-authored personas, generated charges)
| Key | Household | Members | Banks (sandbox-labelled) | Subs | Story beats |
|---|---|---|---|---|---|
| `lindqvist` | Familjen Lindqvist, Täby | Sara (Admin), Johan, Elin (19), Noah (8, dependant) | SEB, Swedbank, Revolut, Amex | ~34 | Two individual Spotify plans (Better together → Family), Netflix price hike, Viaplay cancelled then resubscribed for football season, annual Storytel, SATS for two, Elin's private dating-app subscription (Always private), USD-billed ChatGPT with FX drift |
| `andersson-karimi` | Aisha & Johan-Karimi, Malmö | 2 adults | Handelsbanken, Nordea, ICA Banken | ~22 | 70/30 split, trial converted to paid (Disney+), duplicate charge anomaly, broadband price change |
| `studentkorridoren` | Flat-share, Uppsala | 4 roommates | Swedbank, Nordea, Lunar, Revolut | ~18 | Shared broadband + Netflix + cleaning, fixed-amount splits, one roommate leaves mid-year |
| `solo-amir` | Amir, Göteborg | 1 | SEB, Revolut | ~14 | Unused-looking overlap (3 video services), annual Adobe renewal, gym cancelled but still charged (anomaly) |
| `trigenerational` | Familjen Berg, Umeå | 3 adults + 1 child | Länsförsäkringar, Swedbank | ~27 | A grandparent's newspaper subscription, a recurring donation, Open book ON for one member |

Plus a **background population** of 5,000 households (lightweight, statistics only) for clustering, cohort comparison and ML training.

## 3. Realism requirements (all must be present)
- **History length:** 24 months back from `asOf`, with some connections only offering 12 months.
- **Merchant descriptor variants:**
  - 3–6 per merchant, e.g. `NETFLIX.COM`, `Netflix International B.V.`, `NETFLIX.COM 866-579-7172 NL`, `KLARNA*NETFLIX`, `APPLE.COM/BILL` (Apple-billed).
  - Card-network noise: `PAYPAL *SPOTIFYAB`, `SumUp *`, `Zettle_*`.
- **Timing:**
  - The billing day drifts ±1–3 days, and weekends/holidays shift to the next banking day (Swedish bank holidays).
  - Pending → booked transitions happen 1–3 days later.
- **Amounts:**
  - Exact list prices for SEK billing.
  - FX-converted varying amounts for USD/EUR billing, with `original_amount` and `original_currency`.
  - Occasional pro-rata first charges.
- **Lifecycle events:**
  - Trials (0 kr, or 1 kr card checks), trial conversions, cancellations, re-subscriptions, pauses.
  - Plan upgrades and downgrades.
  - Annual renewals.
  - Refunds (positive amounts), chargebacks, a failed payment followed by a retry 3 days later, and duplicate charges.
- **Price hikes:** at least 1 hike per 6 subscriptions over 24 months, with realistic timing (the same month across users of the same service).
- **Noise (non-subscriptions, must be rejected):**
  - Salary (25th, adjusted for weekends), rent or mortgage, electricity, insurance, groceries (ICA, Coop, Willys, Lidl, Hemköp), Systembolaget, SL single tickets, restaurants, Swish transfers, internal transfers, CSN.
  - Recurring-but-not-subscription patterns, such as the same café every weekday or a weekly ICA shop, deliberately stress the classifier.
- **Accounts:** checking (lönekonto), card accounts, a shared household account (joint account owned by one connection's user), and a credit card with monthly statements.
- **Currency formatting:** SEK, with a few EUR/USD.

## 4. Seeding modes
| Mode | Used by | Content |
|---|---|---|
| `test` | unit/integration tests | Tiny fixtures with exact expected outputs (golden files) |
| `dev` | local + VPS staging | All 5 showcase households + 200 background households |
| `demo` | demo tenant (F12) | `lindqvist` only, refreshed nightly to keep "upcoming renewals" current (the `asOf` date rolls forward) |
| `ml` | training | 5,000 households, JSONL export |

## 5. Tink Sandbox alignment
- The Tink Sandbox data is whatever Tink's test institutions provide. The `bank-data-provider` skill requires inspecting it, and never inventing fields.
- The normaliser must handle both providers. The synthetic generator's raw output format is modelled on the Tink transaction shape *as verified*, so the normaliser code path stays the same.
