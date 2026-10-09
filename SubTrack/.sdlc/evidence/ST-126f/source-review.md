# ST-126f Independent Source Review

**Verdict: APPROVE**

## Frozen sources

All three actual source hashes match `.sdlc/evidence/ST-126f/source-freeze.json`:

| Source | SHA-256 | Match |
|---|---|---|
| `packages/domain/detection/converted-cost-anomalies.ts` | `f19a41e224876b6a52f5f26c8ade7bde6f59922ea2aa6b9c5b05c1d8c8a4c178` | Yes |
| `packages/domain/test/converted-cost-anomalies.spec.ts` | `b6a0e2e9e79096e6b0000cce1bef3b0193d5944235c2bd56a016d2b0c2148bcf` | Yes |
| `packages/domain/detection/converted-cost-anomalies.md` | `de3001417c5ee855aa1f450f00ca42815e4793705c7a92138cd24eed687012ed` | Yes |

## Review findings

No blocking or non-blocking source findings. The helper accepts actual arrays only, bounds batch/history/aggregate counts and ID length, captures row properties once, copies histories by numeric index, and delegates pair validation and every monetary decision to `isConvertedCostOutsideMedianBand`. Delegation validates all pairs before the insufficient-history `false` return. Failures collapse to the fixed Domain error; findings expose only transaction ID and the fixed reason, are sorted by Unicode codepoint with prefixes first, and are frozen along with the result array. I found no monetary arithmetic or coercion in the Domain helper.

The accepted Money implementation uses absolute bigint ratios reduced to exact fractions, sorts by cross multiplication, and computes an even median as the exact rational mean. Its threshold expression `20 * delta > center.numerator * value.denominator` implements strict relative drift greater than 5%; equality remains inside. For history ratios `1, 1, 2, 2`, the median is exactly `3/2 = 1.5`. The inclusive thresholds are `1.425` and `1.575` (covered by accepted Money tests using `57/40` and `63/40`); the Domain goldens use `356/250 = 1.424` and `197/125 = 1.576`, correctly outside. The Domain suite also exercises odd median, signed and large bigint values, and validates malformed short histories.

The code and docs accurately leave caller responsibility for owner authorization, authoritative billed/settled values, posted-debit/refund eligibility, service/currency grouping, chronological prior references, and candidate exclusion. They describe booked conversion cost including fees, markup, and rounding, and make no market-FX, confidence, default-policy, or integration claim. This matches the task contract, AI_ML_SPEC §5, and accepted ADR-0015. Full ST081/ST126 source-model integration remains pending because authoritative original billed fields are absent; this helper adds no index, provider, DB/schema, HTTP, default, or UI wiring.

## Review limits and activity

Root QA reports full Domain tests, actual-helper 100% branch coverage, lint, typecheck, and build as passing; I did not rerun them. I performed no repository edits other than this review artifact, and ran no tests, git commands, network operations, or installs. Prior tool-cap overrun was reported to the parent; this completion brings the actual underlying tool-call count to **9** total. No failures were observed.
