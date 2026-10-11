# ST-238 required browser headers — source handoff

2026-10-11. Narrow contract correction at C2 source HOLD. No commit, push or self-approval.

The five browser-cookie-only operations now reference required `ExactOrigin` and required `BrowserSessionCsrf`: `POST /v2/me/mode`, `POST /v2/me/mode/read`, `POST /v2/subscriptions/owner/read`, `POST /v2/me/profile/read`, and `PATCH /v2/me/profile`. The new CSRF parameter is `X-Session-CSRF`, `required: true`, with a nonempty string schema and current verified browser identity/session description. Shared `OriginForWeb` and `SessionCsrf` remain optional for mobile-capable operations. Existing detail/status browser header requirements, runtime availability, security schemes, request/response matrix, and legacy contracts are unchanged.

`v2-auth.test.mjs` now asserts required exact Origin and nonempty required session CSRF for all five classified private POST routes and explicitly for profile PATCH. It also asserts the shared mobile-capable components remain optional. Generated production bindings were refreshed from OpenAPI; only `generated/index.ts`, `types.gen.ts`, and `zod.gen.ts` changed.

Validation: all 27 contract tests and the generated Zod fixture passed in one full `@subtrack/contracts test` run. A final assertion-only test edit was followed by the focused `v2-auth.test.mjs` run (5 passed). Contract, API, and web typechecks passed. `git diff --check` passed. The temporary Windows `pnpm.cmd` shim used for nested package scripts is outside the repository. The initial contract test run passed 27 tests but its nested fixture command could not resolve `pnpm`; the corrected shim enabled the subsequent complete passing run.

Changed source for independent review: `packages/contracts/openapi.yaml`, three generated files, and `packages/contracts/tests/v2-auth.test.mjs`. This handoff is the only evidence file I authored. The concurrent task metadata and actual QA evidence appearing in the shared checkout are outside this correction and were not edited by me. C2 remains held pending independent exact-head review and root decisions.
