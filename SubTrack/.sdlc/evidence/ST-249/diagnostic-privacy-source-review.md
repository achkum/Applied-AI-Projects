# ST249 diagnostic correction — independent privacy source GO

2026-10-14. Inspected the actual two-file diff and handoff. **SOURCE GO**, limited to closed diagnostic preservation; no repeated tests, raw logs, Git, SQL, remote operations or credential inspection performed.

Integration reexports the already reviewed safe bank diagnostic predicate. The qualifier reads only primitive own-data-property `message` values, catches hostile descriptor access, rejects CR/LF and validates the complete unchanged ST244/ST248 grammar or the finite ST249 phase roster before emitting a line. Unknown/asynchronous failures use fixed UNKNOWN; synchronous setup failures use fixed SETUP. No stack, arbitrary message, row, identifier, credential or appended private suffix can pass this closed grammar. The shell filter retains only the same anchored enum labels. Existing baselines, assertions, receipt/schema and cleanup-before-publication remain unchanged; failure still exits nonzero. This source GO does not reconstruct the deleted prior error or claim runtime acceptance.

Reviewed handoff hashes:

- `apps/api/test/private-mobile-detection.integration.ts`: `01f09cf25c105cb4140787af87e884c89f033e858670fbd00dd6801cc4a579e0`
- `tools/database/private-mobile-detection-qualify.sh`: `f62bdc0ace2a552b8d34541d37cb1122e9c32b12bdeb13128535aa3abcac02bd`

Conductor must preserve these exact source hashes during curation and retain the existing exact-head hosted custody/secret/check gates before one causal new-head qualification.
