# Amount anomaly detection

`detectAmountAnomalies` accepts an already authorized owner's posted debit charges with homogeneous-currency, service or subscription grouped chronological reference histories. The caller excludes the candidate from its history. The helper does not fetch, authorize, group, reorder caller histories, classify lifecycle or direction, or distinguish refunds.

The helper delegates all Money validation and median/MAD calculations to `@subtrack/money`'s reviewed `isAmountOutsideMedianMad` primitive. Its literal singleton and zero-MAD behavior is inherited from that primitive. It makes no claim that a finding is sufficiently supported or confident for production action.

Inputs are bounded to 1,000 charges, at most 1,000 history entries per charge, and 10,000 history entries across the batch. Histories are copied by index using their captured length before analysis. Transaction IDs must be unique, nonblank strings of at most 128 UTF-16 code units. Any invalid input, capacity violation, or unexpected primitive failure throws only `Error('Amount anomaly detection unavailable')`; the batch returns no partial findings.

Results contain only flagged transaction IDs and the fixed `AMOUNT_OUTLIER` reason, sorted by Unicode codepoint order. The result array and each result object are frozen. Amounts, currencies, dates, account details, merchants, and input references are never returned or logged, and inputs are not mutated.
