# ST-083b frozen source review

Decision: **APPROVE** for the frozen standalone source scope.

## Freeze verification

The three frozen source files match the hashes recorded in `.sdlc/evidence/ST-083b/source-freeze.json`:

- `packages/domain/detection/price-increases.ts`: verified against the freeze manifest.
- `packages/domain/detection/price-increases.md`: verified against the freeze manifest.
- `packages/domain/test/price-increases.spec.ts`: verified against the freeze manifest.

The implementation delegates all price arithmetic and Money validation to `isConfirmedSekPriceIncrease`. Domain code captures the batch length once, checks its numeric integer bound, reads each row index and row property once, enforces nonblank bounded unique string IDs, and passes the captured Money and history references directly to Money. It does not pre-read history length or indices, and delegates every row before producing any output. Failures are caught and replaced by a fixed generic Error without a cause. Findings contain only the unchanged transaction ID and fixed reason, are frozen individually and as a newly created array, and use Unicode codepoint ordering with prefixes before extensions.

The Money implementation snapshots unique Money object fields once in a call-local WeakMap, reads the actual history array length and three indices once without iteration, validates all five logical inputs before returning false, normalizes signed bigint magnitudes, uses the exact median of three and strict `100*delta > 3*median || delta > 500` rule, and maps malformed values/getters/proxies to the fixed MoneyError message. It uses no floating point or Number conversion.

The task and evidence preserve the caller-owned source, ownership, service/cadence, chronology, refund and next-cycle provenance boundary. The helper adds no index/default export, API, schema, provider, persistence, database, UI, notification, automatic action, or completion claim for broader ST-083. QA evidence reports the full domain suite and helper branch coverage plus lint, typecheck and build as passing; this review did not rerun checks.

## Exact calls and failures

1. `pwd && rg --files -g 'AGENTS.md' -g 'CONSTITUTION.md' -g 'DECISION_RULES.md' -g 'ADR-0017.md' -g 'ST-083b.md' -g 'plan-review.md' -g 'root-qa.md' -g 'source-freeze.json' -g 'price-increases.ts' -g 'price-increases.md' -g 'price-increases.spec.ts' -g 'price-increase.ts' -g 'price-increase.md'` — succeeded; task evidence is hidden, so this first non-hidden listing did not enumerate `.sdlc` paths.
2. `rg --files --hidden .sdlc` — succeeded; broad listing was truncated by the tool output limit, then exact requested paths were read.
3. Python read/hash call over the exact requested governance, task, review, domain, and Money paths — succeeded; output was truncated, so the remaining exact files and hashes were reread in call 4.
4. Python read/hash/manifest comparison over `.sdlc/evidence/ST-083b/source-freeze.json`, `.sdlc/evidence/ST-083b/root-qa.md`, `.sdlc/evidence/ST-083b/plan-review.md`, and `packages/domain/detection/price-increases.ts`; followed by writing this report — succeeded. No source file was written or patched.

No failed read, write, or patch calls. No tests, git commands, network access, installs, database access, or repository source edits were performed.
