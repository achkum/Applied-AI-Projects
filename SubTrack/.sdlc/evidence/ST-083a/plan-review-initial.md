# ST083a independent plan review

**REQUEST_CHANGES**

The plan's core arithmetic is consistent with AI_ML_SPEC §4: use the median of three prior charge magnitudes; require a positive increase; and confirm only when the same normalized minor-unit price appears next cycle and either strict threshold is exceeded. The literal goldens below correctly exercise strict equality and both sides of the OR. No conflict requires blocking the explicitly bounded SEK-only pure function.

Before implementation, clarify the validation contract in the plan: “snapshot input fields once” must include each Money object's `minorUnits` and `currency` getters exactly once, then validate the captured values; the array's captured length and each of its three indexed entries must also be read once. Ensure failures from any property read, proxy, or malformed shape map to the one fixed MoneyError, and ensure all five money values are fully validated before returning false for a non-repeat, reduction, or equal price. `readonly` is compile-time only, so implementation must not trust the Money interface at runtime. “Canonical SEK” should mean exact `currency === 'SEK'`; do not call `.toUpperCase()` on untrusted values or infer validity from the permissive general currency checker. The plan already calls for nonzero signed values and normalizing magnitudes; state explicitly that magnitude conversion and sorting use BigInt only, while direction/refund eligibility remains caller-owned.

The identical-repeat rule is a defensible explicit assumption, not supplied by the spec's phrase “repeats on the next cycle.” Keep it recorded as an assumption pending the stated owner/architect adoption; do not broaden it to a tolerance. The 500 threshold is exactly 500 minor units in the specified SEK-only boundary, and the comparison is strict. Currency conversion, a new persisted `price_event`, forecast changes, and caller eligibility/provenance/chronology are outside this helper's evidence and must not be claimed as implemented or validated.

## Literal math oracles

- Prior magnitudes `[10000, 10000, 10000]`, candidate/next `10300`: false (`100 × 300 = 30000`, equals `3 × 10000`; delta is also below 500).
- Same baseline, candidate/next `10301`: true (`30100 > 30000`; delta 301 is below 500).
- Prior magnitudes `[20000, 20000, 20000]`, candidate/next `20500`: false (delta equals 500 and `50000 < 60000`).
- Same baseline, candidate/next `20501`: true (delta 501 > 500 while `50100 < 60000`).
- Baseline 10000, candidate/next 10500: true (50000 > 30000, even though delta equals 500).
- Baseline 20000, candidate/next 20600: true (delta 600 > 500, even though `60000 = 3 × 20000`).
- Prior magnitudes `[9000, 10000, 20000]` have median 10000; candidate/next 10301 is true. Permuting the three prior values preserves that result; their mean is irrelevant.
- Equal or lower candidate, or a changed next-cycle magnitude, is false after full validation.
- Apply the same oracle to all-negative signed inputs by magnitude; zero in any of the five inputs is invalid.

## Boundaries and decisions

- The helper can validate shape, exact SEK currency, nonzero bigint minor units, captured array length/indexes, and fixed error mapping. It cannot establish original-caller eligibility, refund exclusion, owner/service/cadence grouping, chronological correctness, or that the next charge is genuinely the next cycle. Those remain caller obligations and must not be represented as proven by unit tests.
- FX and foreign-currency semantics are intentionally unresolved at this standalone SEK boundary; their absence is not a blocker for this task.
- A new exported helper and index export are an additive API / cross-cutting architecture choice (Type 2a under DECISION_RULES §1). Require architect confirmation and ADR/short-form record before implementation dispatch as the plan says. Root remains accountable for the financial rule and security review.
- Scope excludes persisted price events, source integration, forecast changes, defaults, and UI claims. AI_ML_SPEC §4's eventual confirmed `price_event` behavior remains unimplemented by this helper.

## Review evidence

Read the plan and its seven mandatory paths in two shell calls total: first the exact plan path, then one batched `cat` of AGENTS.md, CONSTITUTION.md, DECISION_RULES.md, AI_ML_SPEC.md, DATA_MODEL.md, `money.ts`, and `validate.ts`. Both calls succeeded. No git, network, database, tests, setup skill, installation, or repository writes were used. This review is the only write to the authorized review path; underlying shell-call count: 2, failures: 0.
