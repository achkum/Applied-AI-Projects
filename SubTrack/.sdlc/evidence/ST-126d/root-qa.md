# ST126d root verification

Full domain: 153 tests across 9 files passed, including 13 new amount-anomaly tests. Exact helper V8 JSON metric asserted: 33/33 branches, 61/61 statements, 58/58 lines and 7/7 functions covered (all100%). Domain lint, strict typecheck and build passed. No coverage configuration or thresholds changed.

Tests exercise actual accepted MoneyAPI through the domain wrapper, strict/inclusive/fractional/negative/hugeBigInt decisions, codepoint/prefix/permutation ordering, exact input/history/reference limits, primitive/delegated malformed Money failures, duplicateIDs, indexed-copy ignoring a caller iterator, getter/count failures, no partial findings and frozen output/input invariants. Root simplified the comparator's unreachable equal-ID branch (duplicates rejected) and added malformed captured batch length and exact128ID tests before freeze. Author6calls/unit4calls; no runtime arithmetic outsideMoney or dependency/index change.

Conductor local architecture review: acceptedST126c receipt establishes available Money primitive via existing dependency. Wrapper delegates all Moneyvalidation/math, snapshots bounded histories by index and returns only ID/reason. Caller authorization, posted-debit filtering, service grouping, chronological reference selection and candidate exclusion remain external; singleton/zeroMAD semantics inherit accepted ADR0014 without a production sufficiency claim. FullST081/ST126 integration remains pending. No API/default/schema/DB/provider/UI changes.

Independent frozen three-hash source review, staged gitleaks and exact-head CI remain pending merge gates at this checkpoint.
