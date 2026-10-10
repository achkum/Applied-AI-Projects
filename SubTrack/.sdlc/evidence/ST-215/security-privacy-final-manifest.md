# ST-215 security/privacy final source manifest — 2026-10-10

Disposition: **APPROVE contract-only source** at the blobs below; QA, exact-head CI, merge and runtime gates remain separate.
OpenAPI `ab9c1bbf27b4891fdf71cc458f3487d3e493b6a0`; API_CONTRACT `b4d4ffc21eb573300d078f5518d8cd13600012b0`; ADR-0023 `d5779ece0529deb564a18b1aa499bf2ca2d0bf64`.
Contract tests `ea406894f689fbd9fdc2da4f6a98449e5a66dc58` and `bc17a5b9d05912820c5dcfdcf2e7f3b1f53b90e3`; generated Zod/types/SDK `5733533e9f85294c6e390fd685c84cd3614d215e` / `8ce0cb1d68adb398304da1ae7a673d763e0e16f9` / `aa789af8d846c598ff8bef7d2799a5c86bfb7eb0`.
The PATCH is marked `unavailable-default`, uses accepted V1 current-session Bearer ownership and UUID path, and accepts exactly one strict `status` target in ACTIVE/PAUSED/CANCELLED/ARCHIVED. Every query parameter is explicitly rejected with 400; body/query cannot nominate principal, scope, action or edit authority.
Only seven locked-current owner transitions are allowed. Target selects the private-writer action deterministically; same-status, DETECTED, TRIAL, REJECTED and ARCHIVED source states conflict, without unlocked dispatch.
Success is bounded to `{id,status}`. RFC 9457 400/401/404/409/500 references cover malformed request, invalid principal, identical missing/invisible 404, stale/disallowed pair and masked storage failure; error schema excludes private details.
An uncertain retry can yield 409 and requires authoritative re-read. No ordinary audit, replay receipt, idempotency or retention state is introduced; broad edits, review, feedback, undo and sharing remain separate roadmap work.
The prior platform zero-query source condition and security editorial correction are fulfilled. Contract assertions cover query wording, V1 security, response codes/references, and generated strict shapes; this review did not run tests or CI.
This grants no HTTP route, identity model or production authority. Runtime remains gated by accepted ST-081c and independent exact-head principal/RLS/concurrency/rollback security proof.
