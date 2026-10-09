# ST083a independent plan review

**APPROVE, conditional on the plan's pre-dispatch records and adoption gates.** The clarification resolves the initial review's runtime validation and snapshot concerns. The math rule and literal oracles are consistent with AI_ML_SPEC §4. Do not dispatch implementation until the plan's explicit assumption record and ADR0017/architect Type 2a adoption are complete; root retains financial-rule and security accountability.

The clarified contract is adequate: each unique Money object is snapshotted once and aliases reuse that snapshot; actual bigint, nonzero minor units and exact `currency === 'SEK'` are required; history length and its three indexes are captured once; all five logical inputs are validated before a false result; malformed shapes, getters, and proxies map to the fixed MoneyError. WeakMap memoization of at most five identities is compatible with the specified bounded inputs. BigInt-only magnitude and sorting avoid float conversion. Ensure the implementation rejects functions as stated, despite functions being valid WeakMap keys, and catches failures at every access boundary.

## Literal math oracles

- Prior magnitudes `[10000, 10000, 10000]`, candidate/next `10300`: false (`100 × 300 = 30000`, equals `3 × 10000`; delta is below 500).
- Same baseline, candidate/next `10301`: true (`30100 > 30000`; delta 301 is below 500).
- Prior magnitudes `[20000, 20000, 20000]`, candidate/next `20500`: false (delta equals 500 and `50000 < 60000`).
- Same baseline, candidate/next `20501`: true (delta 501 > 500 while `50100 < 60000`).
- Baseline 10000, candidate/next 10500: true (`50000 > 30000`, even though delta equals 500).
- Baseline 20000, candidate/next 20600: true (delta 600 > 500, even though `60000 = 3 × 20000`).
- Prior magnitudes `[9000, 10000, 20000]` have median 10000; candidate/next 10301 is true. Any permutation yields the same median and result; the mean is irrelevant.
- Equal or lower candidate, or a changed next-cycle magnitude, is false after full validation.
- Apply the same oracle to all-negative signed inputs by magnitude; zero in any of the five logical inputs is invalid.

## Boundaries and decisions

The helper can validate shape, exact SEK currency, nonzero bigint minor units, captured array length/indexes, and fixed error mapping. It cannot establish original-caller eligibility, refund exclusion, owner/service/cadence grouping, chronological correctness, or that the next charge is genuinely the next cycle. Those remain caller obligations and must not be represented as proven by unit tests.

FX and foreign-currency semantics are intentionally unresolved at this standalone SEK boundary; their absence is not a blocker. Persisted price events, source integration, forecast changes, defaults, and UI claims are excluded. AI_ML_SPEC §4's eventual confirmed `price_event` behavior remains unimplemented by this helper.

A new exported helper and index export are an additive API / cross-cutting architecture choice (Type 2a under DECISION_RULES §1). Architect confirmation and ADR/short-form adoption are required before implementation dispatch, as the plan specifies. The exact-repeat rule, invalid-zero policy, and SEK-only scope remain explicit assumptions that must be recorded before dispatch.

## Review evidence and call accounting

Read the plan and its seven mandatory paths in two shell calls total: first the exact plan path, then one batched `cat` of AGENTS.md, CONSTITUTION.md, DECISION_RULES.md, AI_ML_SPEC.md, DATA_MODEL.md, `money.ts`, and `validate.ts`. The follow-up read only the updated plan and verified its clarification. No git, network, database, tests, setup skill, installation, or repository writes were used.

Cumulative underlying shell calls: 5; failures: 0. Breakdown: one initial plan read, one batched mandatory-source read, one initial report write, one follow-up plan read, and one final report write. Non-shell collaboration calls: one status message to the parent. No other tool calls were made.
