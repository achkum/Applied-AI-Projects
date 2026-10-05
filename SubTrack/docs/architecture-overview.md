# SubTrack Architecture Overview

A supplement to [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md) focused on the data flows and AI pipeline that are most relevant for active development.

---

## System diagram

```mermaid
C4Context
  title SubTrack — system context

  Person(user, "Household member", "Uses web or mobile app")
  System(subtrack, "SubTrack", "Subscription tracking & insights")
  System_Ext(bank, "Bank / Tink", "Open Banking API (sandbox)")
  System_Ext(llm, "LLM APIs", "Gemini · Groq · OpenRouter-free")
  System_Ext(bankid, "BankID", "Swedish identity verification")
  System_Ext(push, "Expo Push / SMTP", "Notifications")

  Rel(user, subtrack, "Uses", "HTTPS")
  Rel(subtrack, bank, "Fetches transactions", "REST / Tink SDK")
  Rel(subtrack, llm, "Sends prompts", "HTTPS")
  Rel(subtrack, bankid, "Identity verification", "mTLS")
  Rel(subtrack, push, "Sends alerts", "HTTPS")
```

```mermaid
graph TB
    subgraph Clients
        Web["apps/web\nNext.js PWA"]
        Mobile["apps/mobile\nExpo RN"]
    end

    subgraph Edge
        Caddy["Caddy\nTLS · rate limits · headers"]
    end

    subgraph Core
        API["apps/api\nNestJS :4000"]
        PG["PostgreSQL 16\nRLS enabled"]
        Redis["Redis\nSessions · BullMQ"]
        Worker["services/worker\nBullMQ processors"]
        ML["services/ml\nFastAPI :8000"]
    end

    subgraph DataLayer
        BankIface["BankDataProvider\ninterface"]
        Synthetic["SyntheticBankProvider\ndev + test"]
        Tink["Tink Sandbox\nOpen Banking"]
    end

    subgraph AILayer
        Gateway["packages/llm-gateway\nLRU cache · rate limiter"]
        Gemini["Gemini API"]
        Groq["Groq API"]
        OpenRouter["OpenRouter\n(:free only)"]
        Template["TemplateProvider\n(tests)"]
    end

    subgraph DevOps
        Seed["services/demo-seed\ncron 03:00 nightly"]
    end

    Web & Mobile --> Caddy
    Caddy --> API
    API --> PG & Redis
    Redis --> Worker
    Worker --> ML
    API --> ML
    API --> BankIface
    BankIface -->|dev/test| Synthetic
    BankIface -->|sandbox| Tink
    API --> Gateway
    Gateway --> Gemini & Groq & OpenRouter & Template
    Seed --> Synthetic
    Seed --> PG
```

---

## Data flow: bank transaction → subscription detection

```mermaid
sequenceDiagram
    participant W as Worker
    participant IW as IngestionWorker
    participant BP as BankDataProvider
    participant IS as IngestionStore
    participant ML as ML Service /classify
    participant Norm as Merchant Normaliser
    participant DB as PostgreSQL

    W->>IW: backfill(accountId, from, to)
    IW->>BP: getTransactions(accountId, from, to)
    BP-->>IW: BankTransaction[]
    IW->>IW: normalizeTransaction() → IngestionRecord[]
    IW->>IS: getExisting(accountId)
    IS-->>IW: Map<dedupKey, IngestionRecord>
    IW->>IW: deduplicateRecords() → {inserted, updated, unchanged}
    IW->>IS: insertMany(inserted)
    IW->>IS: updateMany(updated)

    loop for each new IngestionRecord
        W->>ML: POST /ml/v1/classify {description, amount_minor}
        ML-->>W: {is_subscription, confidence, category}
        alt is_subscription = true
            W->>Norm: match description against catalog aliases
            Norm-->>W: merchantId (or NEW_MERCHANT)
            W->>DB: upsert detected_subscription
        end
    end
```

---

## LLM Gateway internal flow

```mermaid
flowchart LR
    caller([Application code]) -->|LlmRequest| gw[LlmGateway.complete]

    gw --> cache{Cache hit?}
    cache -->|yes| ret1([return cached\nlatencyMs=0])
    cache -->|no| rl{Rate limit\nOK?}
    rl -->|exceeded| err1([throw RateLimit])
    rl -->|ok| adapter{provider adapter}

    adapter -->|gemini| gem[GeminiProvider\n@google/generative-ai]
    adapter -->|groq| gro[GroqProvider\ngroq-sdk]
    adapter -->|openrouter| or[OpenRouterProvider\nfetch + :free guard]
    adapter -->|template| tpl[TemplateProvider\nstatic response]

    gem & gro & or & tpl --> resp[LlmResponse]
    resp --> write[cache.set]
    write --> ret2([return LlmResponse])
```

---

## ML training + inference pipeline

```mermaid
flowchart TB
    subgraph Training data
        yaml["packages/catalog/data/merchants.yaml\n62 merchants · ~300 aliases"]
        negs["24 synthetic non-subscription\ndescriptors"]
    end

    subgraph Feature extraction
        tfidf_sub["TF-IDF char_wb 3-5\nmax_features=5000\n(subscription clf)"]
        tfidf_cat["TF-IDF char_wb 3-5\nmax_features=8000\n(category clf)"]
        tfidf_desc["TF-IDF char_wb 3-5\n(descriptor clustering)"]
    end

    subgraph Models
        sub_clf["SubscriptionClassifier\nLogisticRegression C=5"]
        cat_clf["CategoryClassifier\nLogisticRegression C=5\n13 classes"]
        desc_cl["DescriptorClusterer\nDBSCAN cosine"]
        hh_cl["CohortClusterer\nK-means k=3\nStandardScaler"]
    end

    subgraph Inference endpoints
        classify["POST /ml/v1/classify"]
        cluster_d["POST /ml/v1/cluster/descriptors"]
        cluster_h["POST /ml/v1/cluster/households"]
    end

    yaml --> tfidf_sub & tfidf_cat
    negs --> tfidf_sub
    tfidf_sub --> sub_clf
    tfidf_cat --> cat_clf
    yaml --> tfidf_desc
    tfidf_desc --> desc_cl

    sub_clf --> classify
    cat_clf --> classify
    desc_cl --> cluster_d
    hh_cl --> cluster_h
```

> **Note:** Training is in-process at FastAPI startup (scikit-learn Pipeline). No model files are written to disk; models are re-trained from the catalog YAML on every service start. For production, add a `joblib.dump/load` step.

---

## Package dependency graph

```mermaid
graph BT
    config["@subtrack/config"]
    domain["@subtrack/domain"]
    money["@subtrack/money"]
    synthetic["@subtrack/synthetic"]
    catalog["@subtrack/catalog"]
    llm_gw["@subtrack/llm-gateway"]
    contracts["@subtrack/contracts"]
    ui_tokens["@subtrack/ui-tokens"]
    ui["@subtrack/ui"]
    i18n["@subtrack/i18n"]
    web["apps/web"]
    api["apps/api"]
    mobile["apps/mobile"]
    worker["services/worker"]
    demo_seed["services/demo-seed"]

    config --> domain & money & synthetic & catalog & llm_gw & contracts & ui_tokens & ui & i18n
    domain --> synthetic
    domain --> api & worker
    synthetic --> demo_seed
    catalog --> api & worker
    llm_gw --> api & worker
    contracts --> web & api & mobile
    ui_tokens --> ui & web & mobile
    ui --> web
    i18n --> web & mobile & api
    money --> api & worker & web & mobile
```

---

## CI quality gates

Every PR on a `st/*` branch runs the full `subtrack-ci` workflow:

```mermaid
flowchart LR
    PR --> lint[pnpm lint] --> tc[pnpm typecheck] --> tests[pnpm test\n vitest all packages]
    tests --> contrast[Token contrast\nWCAG AA check]
    contrast --> storybook[Storybook build\n+ visual regression\nPlaywright 1% threshold]
    storybook --> ml[uv run pytest\nML service tests]
    ml --> i18n[i18n parity check]
    i18n --> secrets[Gitleaks\nsecret scan]
    secrets --> licenses[License allowlist\nSPDX check]
    licenses --> merge{auto-merge\non success}
```

Auto-merge is handled by `.github/workflows/auto-merge.yml` — squash merge with branch delete.
