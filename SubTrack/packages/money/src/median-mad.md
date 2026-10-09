# Median/MAD amount outlier primitive

`isAmountOutsideMedianMad(candidate, history)` returns whether the candidate is strictly outside the ordinary median ± 3×ordinary median absolute deviation (MAD) interval for `history`. The caller supplies reference observations that exclude the candidate. History must contain 1–1,000 valid `Money` values in the candidate's currency. Invalid values, currency mismatches, and unexpected property-access failures throw the fixed `MoneyError` message `Amount outlier detection unavailable`.

The implementation keeps every monetary value as a `bigint` minor-unit amount. For sorted values, `median2` is twice the ordinary median. Let `m2` be twice the history median. Each `|2x − m2|` is twice an absolute deviation, so the median of those values is four times MAD. The candidate's `2|2c − m2|` is four times its distance from the median. Comparing that distance with three times the scaled MAD is exact, including fractional medians and MADs; equality at either bound is inside.

A singleton history is mathematically accepted and has MAD zero. With zero MAD, only an amount unequal to the median is outside. This primitive does not establish that a history is sufficient for a production decision. The caller owns grouping, chronology, scoping, and any minimum-evidence policy. The function does not classify debit or refund amounts.
