# Private confirmed SEK price increase findings

`detectConfirmedSekPriceIncreases(charges)` returns a frozen array of frozen,
ID-only findings. Each finding contains the unchanged caller-provided
`transactionId` and the literal reason
`CONFIRMED_SEK_PRICE_INCREASE`. The input batch is bounded to 1,000 rows; each
ID must be a nonblank string of at most 128 UTF-16 code units and unique within
the batch. Findings are sorted by Unicode codepoint order, with a prefix before
its extension.

The detector captures each batch row and its four fields once. It passes the
captured first charge, next-cycle charge, and prior-history references directly
to `isConfirmedSekPriceIncrease`; the Money helper owns validation and all
financial arithmetic. The detector does not read or copy the history array or
inspect Money values. Every successfully shaped row is delegated before any
finding is returned, including rows that do not confirm an increase.

Any invalid batch, row, ID, delegated value, getter, proxy, or unexpected failure
throws only `Error('Price increase detection unavailable')`. The helper does
not mutate inputs and returns no amounts, descriptors, owner IDs, confidence,
timing, or source fields.

Callers provide authoritative eligible posted charges for one owner, service,
and cadence, the three chronological prior charges excluding candidates,
refund handling, and the actual next-cycle charge. This private helper cannot
prove source, chronology, ownership, or transaction-ID association. It does not
persist price events, apply foreign-currency thresholds, detect decreases,
notify users, or take financial action.
