# ST248 bank Boolean wire repair handoff

Actual run38488546994/head3d069d9/job115608009358 failed at TWO_OWNER/B_TO_A_RETAIN/ASSERTION; cleanupremoved. Exact reviewed source at that head selected shared privateBody for every private mobile JSON body. That tokenizer rejects booleans, whereas the already reviewed bank disconnect schema requires literal purge:false/true. No SQL/auth/grant/model failure is indicated.

Frozen plan: bank-boolean-parser-plan.md, privacy PLAN GO before source. Owned minimal delta:

- apps/api/src/banks/private-mobile-bank-body.ts/spec.ts: dedicated flat, ordered duplicate-aware parser preserving8192 and exact content length/type, fatal UTF8, string escape checks, whitespace/object/trailing framing. Strings/null are subsequently checked by unchanged strict bank schemas. Literal true/false only for decoded purge; wrong-field Boolean/numeric/nested/array/prototype/escaped duplicate input rejected400.
- apps/api/src/auth/mobile-private/private-mobile-http.ts: selects parser only for exact BANK_PATHS after unchanged original wire/closed path admission. Every other parser and bodyless refresh is unchanged.
- adjacent private-mobile-http-bank-body.spec.ts: both literals reach actual HTTP strict bank parsing and unchanged current profile or foreign-owner gates; malformed/types/duplicates/nonbank/header/key/Bearer isolation remain rejected.

Shared enrollment parser, contracts, SQL, roles, grants, authority/session/finalfence and existing PG assertions are untouched. The new tests explicitly reproduce legacy shared parser Boolean rejection, so this is cause-backed rather than a guessed database repair.

Actual focused results:

- New parser and HTTP boundary tests6/6PASS.
- Dedicated parser coverage100% all metrics,46/46branches.
- API tsc --noEmit -p tsconfig.json:PASS.
- Targeted ESLint four changed/new sources:PASS (test literal quoting corrected after first lint finding; final tests/lint passed).
- Scoped diff check:PASS.

Initial coverage found a redundant unreachable closing-brace check after the empty-object check/loop break had already proved the exact closing brace. Replaced it with explicit consumption and explanatory comment; malformed/truncated/no-closing bodies still fail the existing loop/token guards and tests. No coverage ignore or bypass added.

No reinstall, broad unchanged suite, hosted/native dispatch or acceptance claim. Heavy slot released. Final independent source review and changed actual PG journey/cleanup remain required. Root owns commit/dispatch and C19 integration.
