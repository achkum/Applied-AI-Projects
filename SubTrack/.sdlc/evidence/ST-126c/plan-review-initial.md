# ST126c plan review — BLOCK

The scaled-rational algorithm is mathematically sound, and the Money/API scope is appropriately bounded, but the plan contains an incorrect hand-calculated example that should be corrected before implementation.

For sorted values, `median2(v)` is twice the ordinary median. If `m2 = median2(history)`, each `d2 = |2x - m2|` is twice an absolute deviation. Therefore `median2(sorted d2)` is four times MAD. `2|2c - m2|` is four times the candidate's distance from the median. The strict test `deviation4 > 3*mad4` is exactly `|c - median| > 3*MAD`; it preserves fractional minor-unit medians and MADs, with equality inside. This remains valid for negatives and arbitrary-size BigInts.

Correct hand checks:

- `[1,2,3]`: median `2`, deviations `[1,0,1]`, MAD `1`; inclusive bounds `[-1,5]`. Thus `-1` and `5` are inside, `-2` and `6` outside.
- `[0,1,2,100]`: median `1.5`, sorted deviations `[0.5,0.5,1.5,98.5]`, MAD `1`; bounds `[-1.5,4.5]`. Integer candidates `-1` and `4` are inside; `-2` and `5` are outside.
- `[0,1,1,2]`: median `1`, deviations `[1,0,0,1]`, MAD `0` (not `0.5`); only candidate `1` is not outside. The plan's claimed MAD `0.5` and bounds `[-0.5,2.5]` are wrong.
- Singleton `[7]`: median `7`, MAD `0`; `7` is inside and any unequal candidate is outside.

The input contract is consistent with the existing `Money` shape and `assertValidCurrencyCode`: require bigint minor units and uppercase three-letter currency, reject currency mismatch, snapshot properties, and translate malformed input/getter or unexpected failures into fixed `MoneyError('Amount outlier detection unavailable')`. The candidate is explicitly excluded from caller-provided history; currency homogeneity, grouping, and chronology remain caller-owned. The additive package-level API fits reversible Type 2a authority under DECISION_RULES, assuming the root conductor is the relevant architect. It makes no integration or production-confidence claim, and defers the full ST081/ST126 integration.

Correct the fractional-MAD example before approval; then this review can approve the plan with its stated limits.
