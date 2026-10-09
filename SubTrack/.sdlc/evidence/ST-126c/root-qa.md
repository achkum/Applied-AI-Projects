# ST126c root verification

Full Money suite: 124 tests across 6 files passed, including 14 new cases. New helper's exact V8 JSON path: 28/28 branches, 40/40 statements, 38/38 lines and 7/7 functions covered (all 100%). Metric asserted directly; no coverage configuration or thresholds changed. Money lint, strict typecheck and build passed.

Independent golden cases cover odd/even ordinary medians, fractional even MAD, strict outside with inclusive thresholds, negative/zero/singleton histories, huge 80-digit integer translations, permutations, frozen input and property snapshots, bounded history, malformed amounts/currencies and unexpected failures. Root added null/primitive/sparse/nonstring currency cases and froze individual history values before initial QA. No runtime arithmetic fix needed. All monetary arithmetic stays within packages/money; no monetary Number/float/rounding conversions.

Architecture accepted under ADR0014 by Conductor acting architect-platform/data after independent plan review. Review initially miscalculated the even median of deviations [0,0,1,1] as zero; root identified the wrong lower-middle choice, reviewer independently corrected to0.5 and approved. Initial report retained, no real blocker waived. Golden test directly protects both even-median stages.

Scope disposition: author reported a read-only git-status call despite its noGit instruction; no repository/source mutation resulted, actual6calls retained. Unit4calls, planreview5calls including correction; no billed token/context-savings claim. Existing Money functions unchanged; index adds only one API export. Caller owns grouping, chronology/candidate exclusion and statistical sufficiency. No consumer/default/UI/API/provider/DB/schema or fullST081ST126 acceptance.

Frozen four-file independent review, staged gitleaks and exact-headCI are separate merge gates pending at this checkpoint.
