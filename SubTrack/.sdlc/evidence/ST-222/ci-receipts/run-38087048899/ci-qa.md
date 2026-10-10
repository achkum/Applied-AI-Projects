# ST-222 exact-head CI QA receipt
- Run: 38087048899 — PASS (owned PostgreSQL 16, compiled Node, Chromium proof).
- Source head: 28d049c01b036a174a41100b3434b45c79aa7619.
- Sanitized case list covers owner/peer projection, invisible 404, malformed/query/selector, CSRF/binding/mixed credentials/Origin, revoke/expire, pool/no-write, SIGTERM/SIGINT, listener reuse and pool baseline.
- Receipt confirms fixture removed, child stopped, and secrets destroyed; cleanup step succeeded.
- Changed-runtime coverage: statements 86.86%, branches 83.33%, functions 82.6%, lines 94.4%.
- Sanitized artifact only: st222-proof-receipt.txt; no raw logs retrieved.
- Earlier failure 3 remains recorded; this is subsequent exact-head proof after the diagnosed query URL fix.
