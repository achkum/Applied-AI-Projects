# ST-219 independent platform source review — 2026-10-10
Verdict: **APPROVE** frozen contract source; QA/full gates and exact-head CI remain separate.
Base: accepted `d74b579`; candidate HEAD `84908129216be3babc4290f9302ea3a228798627` plus frozen uncommitted files.
Frozen source blobs: OpenAPI `d3ae9777`, config `9e0c5b3e`, read test `86bb4475`, v2 auth test `fe57e73a`, contracts test `4bc9fda3`.
Frozen generated blobs: index `e1bfe36d`, SDK `6d3dca0b`, types `e580f7d1`, Zod `5aaca43f`; verified against working files.
Only new route is unavailable-default `POST /v2/subscriptions/{id}/read`; no v1 or existing v2 schema/operation semantic changes in source/generated diff.
The generator exception is limited to closed component objects with zero properties; generated `z.record(z.string(), z.never())` rejects extra keys and avoids unsupported record `.strict()`.
OpenAPI requires UUID path, exact JSON `{}`, no query, web access cookie, Origin and session CSRF; rejects duplicate/mixed/refresh/Bearer authority.
Documented authority order binds verified `sid/sub`, observed binding-cookie hash, current web context/chain, resolver owner/session, then CSRF before server context.
Response reuses strict owner/peer `VisibleSubscription` and string minor units; missing/foreign 404 is identical, 400/401/403/404/500 problems are bounded and no-store.
Generated SDK has POST, required empty body/header types, `query?: never`; Zod path/body/privacy/error checks and contract source assertions cover the new behavior.
The POST is expressly a pure read without idempotency reservation; ADR-0010 only requires idempotency for mutating POSTs.
No runtime, account, browser-client or ST-217 readiness is approved. Browser JavaScript supplies Origin and cookies ambiently; required generated `Origin` typing is a known future client integration constraint.
Author reported targeted read tests 2/2 PASS and generation PASS; I did not run heavy checks. Full contracts check, QA, independent security/client final reviews and exact-head applicable CI remain merge gates.
