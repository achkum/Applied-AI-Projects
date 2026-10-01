# Model Card — Subscription & Category Classifiers

**Version:** 1.0.0  
**Service:** `subtrack-ml` / `services/ml`  
**Last updated:** 2026-10-01

---

## Models

### 1. Subscription Classifier

**Purpose:** Determines whether a bank-transaction description refers to a recurring subscription.

**Architecture:** Two-stage pipeline
- Stage 1 — Rule-based exact/partial alias match against `packages/catalog/data/merchants.yaml`
- Stage 2 — TF-IDF (`char_wb`, n-gram 3–5, 8 000 features, sublinear TF) + Logistic Regression (C=4, balanced class weights)

**Training data:** All `aliases` fields from the merchant catalog (~300+ positive examples) plus 31 hand-curated negative examples (groceries, restaurants, ATM withdrawals, etc.)

**Output:**
```json
{ "is_subscription": true, "confidence": 0.99, "matched_alias": "NETFLIX" }
```

**Threshold:** `confidence ≥ 0.5` → `is_subscription = true`

**Known limitations:**
- Negatives are hand-curated, not sampled from real bank data; recall on novel non-subscription descriptors may be lower.
- Stage 1 partial match requires `len(alias) ≥ 5` to avoid false positives from short tokens.

---

### 2. Category Classifier

**Purpose:** Maps a subscription description to a catalog category code (e.g. `VIDEO_STREAMING`, `MUSIC_STREAMING`).

**Architecture:** TF-IDF (`char_wb`, n-gram 3–5, 10 000 features) + Logistic Regression (C=5, multinomial, lbfgs, 500 iterations, balanced class weights)

**Training data:** All `aliases` + `canonical_name` from the merchant catalog (~350+ labeled examples across ~15 categories)

**Output:**
```json
{
  "category": "VIDEO_STREAMING",
  "confidence": 0.94,
  "top3": [["VIDEO_STREAMING", 0.94], ["MUSIC_STREAMING", 0.04], ["GAMING", 0.01]]
}
```

**Invoked only when** `subscription.is_subscription = true`.

**Known limitations:**
- Categories with few merchants (< 3) may have degraded precision.
- Novel merchant descriptors not in the catalog will be classified by n-gram similarity to existing examples.

---

## API

```
POST /ml/v1/classify
Content-Type: application/json

{ "description": "NETFLIX", "amount_minor": -14900 }
```

`amount_minor` is optional; currently unused by both classifiers but accepted for forward compatibility.

---

## Versioning & Refresh

Models are trained at service startup from the catalog YAML. Re-deploying the service after a catalog update automatically retrains both models. No separate model artefact storage is required at this stage.
