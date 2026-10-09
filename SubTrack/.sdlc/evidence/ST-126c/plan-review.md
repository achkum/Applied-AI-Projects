# ST126c plan review — APPROVE with limits

The scaled-rational algorithm and the plan's hand-calculated cases are correct. For sorted values, `median2(v)` is twice the ordinary median. If `m2 = median2(history)`, each `d2 = |2x - m2|` is twice an absolute deviation. Thus `median2(sorted d2)` is four times MAD. `2|2c - m2|` is four times the candidate's distance from the median. The strict test `deviation4 > 3*mad4` exactly tests `|c - median| > 3*MAD`, preserving fractional minor-unit medians and MADs, with equality inside. The scaling works for negative and arbitrary-size BigInt inputs.

Hand calculations:

- `[1,2,3]`: median `2`; sorted deviations `[0,1,1]`; MAD `1`; bounds `[-1,5]`. `-1` and `5` are inside; `-2` and `6` are outside.
- `[0,1,2,100]`: median `1.5`; sorted deviations `[0.5,0.5,1.5,98.5]`; even MAD `(0.5+1.5)/2 = 1`; bounds `[-1.5,4.5]`. Integer candidates `-1` and `4` are inside; `-2` and `5` are outside.
- `[0,1,1,2]`: median `1`; sorted deviations `[0,0,1,1]`; even MAD `(0+1)/2 = 0.5`; bounds `[-0.5,2.5]`. `0` and `2` are inside; `-1` and `3` are outside.
- Singleton `[7]`: median `7`, MAD `0`; `7` is inside and any unequal candidate is outside.

The minimal API contract fits the existing `Money` shape and `assertValidCurrencyCode`: require bigint minor units and uppercase three-letter currency, reject currency mismatch, snapshot properties, and convert malformed input/getter or unexpected failures to fixed `MoneyError('Amount outlier detection unavailable')`. The candidate is excluded from caller-provided history; currency homogeneity, grouping, and chronology remain caller-owned. The additive package-level API is reversible Type 2a scope under DECISION_RULES, assuming the root conductor is the relevant architect. The plan does not claim integration or production confidence and leaves ST081/ST126 integration pending.

Approval is limited to this arithmetic and API plan review; implementation still needs to honor the stated validation, privacy, testing, and integration boundaries.
