# ST-223 contract implementation handoff

Contract source is ready for independent source review; the route remains `unavailable-default` and no adapter or default graph was changed. This work used approved plan blob `07cf0e20d541bf73c562bae18622b4bfc9abf143` at base `1bfe451eac89dcdbec56691a09faf0c075d09611`. The first client REQUEST_CHANGES of plan `f203c4e0762476b8137c8b4c16d7521b5dc8c2b2` remains in `client-review.md`; cycle two client and security approved the revised plan.

## Normalized source manifest

These are `git hash-object` blob IDs. Review again after the Conductor advances the base and before exact-head gates.

| Path under `SubTrack/` | Blob |
| --- | --- |
| `packages/contracts/openapi.yaml` | `c2f543e745a5f3d76eebd45a5989aa1d14afc63b` |
| `packages/contracts/tests/contracts.test.mjs` | `f2a6f91778f2f895e59f4c71023e1afe01d343be` |
| `packages/contracts/tests/browser-subscription-lifecycle.test.mjs` | `b5be670f1cbfa6ed0c126885616f4940c7c1ecda` |
| `packages/contracts/generated/index.ts` | `401f45ceae6614475c41c80d5c33e5de941162d0` |
| `packages/contracts/generated/sdk.gen.ts` | `b1323dc5e9aed927f1c83ebee0942e76f87fa4a3` |
| `packages/contracts/generated/types.gen.ts` | `a3e13f174576273c242d80dd76bf058d67514f4e` |
| `packages/contracts/generated/zod.gen.ts` | `9238161ed49604b198ff5dd79587ad36da01a810` |

## Focused verification

- Local generator `openapi-ts -f openapi-ts.config.mjs --no-log-file`: PASS; generated SDK/types/Zod match the source.
- `node --test --test-concurrency=1 ./tests/*.test.mjs`: 15 pass, 0 fail, 0 skip. This includes second-run generation stability and the new browser lifecycle contract/Zod assertions.
- `redocly lint openapi.yaml --extends=spec`: PASS.
- `tsc --noEmit -p tsconfig.json`: PASS.
- `git diff --check`: PASS.

## Later adapter and browser proof

A separate runtime task must wire direct HTTPS browser PATCH only inside an explicitly enabled composition. Reject raw duplicate/mixed credentials and headers before parsers collapse them, every query parameter, `Authorization`, refresh cookie and `Idempotency-Key`. Derive `sid/sub` from verified v2 access, hash the observed binding cookie, obtain `webContextForCurrentSession`, resolve the trusted chain with `DevelopmentV2PrincipalResolver`, compare current owner/session, then recheck current session, binding and chain after async resolution before `SessionCsrfGuard` and server-only `RequestContext`. The owner-scoped locked writer must execute under transaction-local ordinary-role PostgreSQL RLS. An owned disposable PostgreSQL plus real direct HTTPS browser proof should cover all seven pairs, missing/foreign identical 404, revocation/rebind during async work, races, rollback and pooled RLS cleanup. After 409 or an uncertain response, the client must use authenticated `POST /v2/subscriptions/{id}/read`, never automatically retry PATCH; failed re-read clears private detail and disables actions. A fixed bilingual 403 client state is still needed. This contract does not establish enrolled-account persistence, ST-217 UI, ST-081 completion or public-release readiness.

Independent client/security source review, fresh QA and exact-head applicable CI remain Conductor gates. ST-222 read proof is separately pending at the time of this handoff.

## Context 3 — required cache header repair

The security source review's Medium finding is repaired: the new PATCH 200 and shared `BrowserSubscriptionLifecycleProblem` headers now declare `required: true` with `const: no-store`. The route test asserts the required header on success and resolves each 400/401/403/404/409/500 response reference to assert required no-store. V1 and V2 read contracts remain unchanged. Regeneration produces the same generated bindings because these response-header requirements do not change the generator's body/SDK wire artifacts. All earlier reviews and manifests above remain historical evidence; independent review and QA of this revised manifest remain required.

| Path under `SubTrack/` | Revised normalized Git blob |
| --- | --- |
| `packages/contracts/openapi.yaml` | `71f2b27c55cd110678fbe18f8e3abc8779dbf776` |
| `packages/contracts/tests/contracts.test.mjs` | `f2a6f91778f2f895e59f4c71023e1afe01d343be` |
| `packages/contracts/tests/browser-subscription-lifecycle.test.mjs` | `61fde74fa466305cce5b1a52fe2f93672efc42e5` |
| `packages/contracts/generated/index.ts` | `401f45ceae6614475c41c80d5c33e5de941162d0` |
| `packages/contracts/generated/sdk.gen.ts` | `b1323dc5e9aed927f1c83ebee0942e76f87fa4a3` |
| `packages/contracts/generated/types.gen.ts` | `a3e13f174576273c242d80dd76bf058d67514f4e` |
| `packages/contracts/generated/zod.gen.ts` | `9238161ed49604b198ff5dd79587ad36da01a810` |

Verification: `corepack pnpm --filter @subtrack/contracts generate` PASS; full package `test` PASS (15 pass, zero fail/skip, repeat generation stability and fixture Zod probe); package `lint` PASS; package `typecheck` PASS; `git diff --check` PASS. The first package test invocation passed all 15 tests but its wrapper exited 1 because nested plain `pnpm` was absent from PATH. This was an invocation-environment failure, not a source failure. Re-running the full test and lint with process-only PATH prefixes `C:\Program Files\Git\usr\bin` and `C:\Program Files\nodejs\node_modules\corepack\shims` passed. No dependency/configuration change was needed. Existing fixture artifacts, ST-211 screenshots/logs/coverage and unrelated worktree changes were left intact; no status/backlog/commit/push was performed.

Budget continuity: original task creation `2026-10-10T20:56:53Z`, M120 attempt 1 and all prior failure/review history are preserved. This context performed only the requested repair under the granted local heavy token. The route remains unavailable by default; this adds no runtime/browser/PG, onboarding, persistent account/session or release proof.
