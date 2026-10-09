# Private duplicate-charge rule

`detectDuplicateCharges` is a private local detection capability for a caller-provided list of already-authorized, posted debit charges belonging to one owner. The caller is responsible for authorization, account visibility, debit filtering, and canonical merchant resolution. The rule performs no retrieval and does not widen access.

An output pair is emitted when both rows share an account, canonical merchant key, and exact `Money` amount including currency, and their UTC calendar dates are at most three days apart, inclusive. The UTC calendar-day comparison means this window is not an exact 72-hour duration. Signed amounts are accepted because debit filtering belongs to the caller.

The helper accepts at most 1,000 rows, requires unique nonblank IDs and nonblank account and merchant keys (each at most 128 characters), valid dates, bigint minor units, and a canonical three-uppercase-letter currency code. Invalid input and more than 10,000 matching pairs produce the same generic error. Results are deterministically ordered by Unicode code point ID order, contain one pair per pair of rows, and are deeply frozen. Inputs are not changed, and results contain no row references or monetary data.

This module is a local component only. Full ST-081/ST-126 integration and upstream acceptance remain pending.
