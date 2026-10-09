# ST126a root verification

Full domain: 118 tests passed across 7 files (13 new duplicate-charge tests). V8 instrumentation of the new helper reports 39/39 branches, 56/56 statements, 47/47 lines and 6/6 functions covered. Actual coverage-summary JSON was asserted for the exact helper path. Domain lint, strict typecheck and build passed; strict typecheck repeated after two meaningful boundary tests were added. No coverage configuration or thresholds changed.

Tests cover UTC-day/elapsed-time distinctions, crossed calendar boundaries, exact bigint/currency equality, account and merchant isolation, invalid inputs, immutable output and unchanged input, stable ordering including supplementary Unicode IDs, 1000/1001 input capacity, exact 10000 accepted pairs and overflow rejection. Root added Unicode and exact boundary cases before source freeze.

Conductor local architecture review: accepted Money API provides a bigint-only input boundary without changing legacy numeric transaction types. Rule is private and not exported from detection index. UTC calendar-day and same-account assumptions are recorded. Full ST081/ST126 integration remains pending; no broader milestone completion claimed. Original proposal is retained as history; architecture-plan.md is the narrowed final readiness contract.

No UI, API registration, dependencies, DB/schema, production or provider calls. Independent review, staged secret scan and exact-head CI are separate merge gates, still pending at this checkpoint. Native Android/iOS validation remains deferred as authorized by the user.
