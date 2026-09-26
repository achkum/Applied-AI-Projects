# AI / ML Specification

## 0. Iron rules
1. **LLMs never compute money.**
   - Every number shown comes from deterministic TypeScript (`packages/money`, `packages/domain`) or the ML service's statistical outputs.
   - LLM output may only verbalise numbers passed to it. A post-check verifies that every number in the LLM text exists in the input payload; if one doesn't, the text is dropped and a template is used instead.
2. **Scope is enforced before the model sees anything.** Prompts only ever contain data the caller may see (DATA_MODEL visibility rule).
3. **No PII in prompts.** Use first names only, no account numbers, no personnummer, no emails.
4. **Every model has a model card** (`services/ml/model_cards/*.md`): data, metrics, limitations, and version.
5. **Graceful degradation.** If the LLM or the ML service is unavailable, the app still works, using template text and rule-based fallbacks.

## 1. Time-series: spend forecast (F9.1)
- **Input:** monthly recurring spend per scope. This is built from the *known schedule* of active subscriptions (deterministic) plus the historical deviations.
- **Method:**
  - Baseline = the deterministic projection of active subscriptions, adjusted for cadences and known annual renewals.
  - Residual model = ETS or Theta on the historic residuals (via `statsforecast`), giving p10/p50/p90 bands.
  - Price-drift term: the per-category historical hike rate (from price_event).
- **Output:** 12 months of p10/p50/p90 values, as `forecast_point` rows.
- **Evaluation:** rolling-origin backtest on synthetic households. Target MAPE < 8% at a 3-month horizon.
- **UI:** a line with a band, and the annotation "Expected annual renewals: Storytel (Mar), Amazon Prime (Aug)".

## 2. Classification (F9.3)
- **Task A (subscription vs not):** binary classification on transaction groups.
  - Features: cadence regularity (std of the day-gaps), amount coefficient of variation, occurrence count, merchant-catalogue hit, description tokens (char n-gram TF-IDF), and whether the amount matches a catalogue price.
  - Model: gradient boosting (LightGBM or scikit-learn HistGradientBoosting).
  - Rules run first. The model resolves the ambiguous middle band (confidence 0.4–0.8).
- **Task B (category):** multiclass over CATEGORIES.md.
  - Model: TF-IDF + logistic regression on merchant descriptors. An LLM few-shot fallback is used for unknown merchants, and its output always goes to the review queue.
- **Training data:** synthetic ground truth (SYNTHETIC_DATA_SPEC) plus user review feedback (`detection_feedback`).
- **Targets:** subscription F1 ≥ 0.92 and category macro-F1 ≥ 0.85 on a held-out synthetic set. This is reported in the model card.

## 3. Clustering (F9.4)
- **Subscription personas:** per user or household, build a vector of category spend shares plus the count, average price and annual/monthly mix.
  - Method: K-Means (k chosen by silhouette in the range 4–8) on a synthetic population of 5,000 households.
  - Clusters are named by an LLM from their centroid descriptions, then reviewed by a human once and frozen as i18n strings (e.g. "Streaming-tung", "Produktivitetsstacken", "Familjelogistik").
- **Similar households:** nearest-centroid comparison ("Households like yours spend 312 kr/month on streaming; you spend 486 kr").
  - Only synthetic cohort statistics are used until real users exist. This is disclosed in the UI.
- **Merchant descriptor clustering:** HDBSCAN on descriptor embeddings (or char n-grams) proposes new merchant aliases to the review queue.

## 4. Price intelligence & scraping (F8)
- **Price Catalogue:** `catalog_plan` + `catalog_price_observation`.
- **Seed:** a curated YAML (`packages/catalog/seed/*.yaml`) with ~120 plans across ~60 merchants. Every entry has `source_url` and `verified_at`.
- **Scraper agent (runtime job, not a dev agent):**
  - Scheduled weekly (BullMQ repeatable job). Uses Playwright on official pricing pages listed in `packages/catalog/sources.yaml`.
  - Each source has a CSS/XPath or text-anchor extractor **plus** an LLM extraction fallback: "extract plans and SEK prices as JSON matching this schema".
  - Safety:
    - Respect robots.txt and the site's ToS; the `sources.yaml` entry records a `robots_ok` check.
    - Throttle to 1 request per 10 seconds per domain, and use an identifiable user agent.
  - Validation:
    - A new price differing by more than 40% from the last observation → quarantined for human review.
    - A schema failure → alert.
- **Comparison logic (deterministic):**
  1. Same-category alternatives.
  2. The same service's other plans (Duo/Family).
  3. Normalised to a monthly cost.
  4. Ranked by saving.
  - Each alternative is always shown with `verified_at`.
- **Hike detection (deterministic):**
  1. Stable price = the median of the last 3 charges.
  2. A new charge above the threshold (3% or 5 SEK) that repeats on the next cycle becomes a confirmed `price_event`.
  3. A single-charge spike becomes an anomaly instead.

## 5. Anomalies (F9.2)
- Rules:
  - A duplicate charge within 3 days, same merchant, same amount.
  - A charge after the subscription was CANCELLED.
  - An amount outside median ± 3×MAD.
  - An unexpected FX swing on a USD/EUR-billed service.
- Optional Isolation Forest scoring is shown as a "why flagged" explanation.

## 6. LLM usage (free tier, showcase)
- **Gateway:** `packages/llm-gateway` with a provider interface: `GeminiProvider` (Google AI Studio free tier), `GroqProvider` (free tier), `OpenRouterFreeProvider` (`:free` models), and `TemplateProvider` (deterministic fallback, always available).
  - Configured by `LLM_PROVIDER_ORDER`.
- **Uses:**
  - Monthly recap narrative (sv/en).
  - Insight explanations.
  - Cluster naming (offline).
  - Scraper extraction fallback.
  - Unknown-merchant categorisation suggestion.
  - "Ask SubTrack" via tool-calling into deterministic endpoints.
- **Guardrails:**
  - Temperature ≤ 0.3.
  - JSON schema validation on structured outputs.
  - The numeric post-check (Iron rule 1).
  - A 10-second timeout, and caching by input hash.
  - Per-user rate limit: 20 LLM calls a day in showcase.
- **Free-tier limits change.** The llm-gateway skill requires the developer to verify current quotas and ToS (including whether free-tier prompts may be used for provider training) before enabling each provider. This is documented in `docs/ops/LLM_PROVIDERS.md`.

## 7. MLOps (lightweight)
- `services/ml/train/*.py`, reproducible with a fixed seed. Artifacts go to `services/ml/artifacts/` (git-LFS or a VPS volume) and are registered in `ml_model_registry`.
- `make ml-train` regenerates the synthetic data, then trains, evaluates, and writes the model cards and a metrics JSON. CI runs the training on a small sample to catch regressions.
