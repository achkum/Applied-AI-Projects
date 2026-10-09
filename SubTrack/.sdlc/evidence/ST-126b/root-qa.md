# ST126b root QA

Full domain: 140 tests passed across 8 files, including 22 cancellation-rule cases. Exact new helper V8 JSON metric asserted: 27/27 branches, 49/49 statements, 42/42 lines, 7/7 functions covered (all 100%). Domain lint, strict typecheck and build passed. No coverage configuration/threshold change.

Root source refinement before freeze: replaced iterator comparator's unreachable equal-ID exit (IDs must be unique) with the existing simple prefix/codepoint comparison approach, preserving ordering; fixed the test's claimed earlier-instant case so it actually uses an earlier instant; added primitive/non-Date input cases, native Date override behavior, exact128-ID boundary and unexpected getter/native receiver errors. All meaningful tests passed without weakening runtime validation.

Conductor architecture review: a standalone private rule with caller-owned authorization, posted debit association and confirmed effective cancellation is available without schema/lifecycle changes. It compares strict instants and infers no cancellation or grace period. Assumption recorded. Full ST081/ST126 integration remains pending. Existing UI and API/default/provider/DB/schema/dependencies unchanged.

Independent three-hash review, staged gitleaks and exact-head CI remain separate pending merge gates at this checkpoint.
