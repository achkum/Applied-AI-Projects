# ST-215 independent platform contract review — 2026-10-10

Disposition: CONDITIONAL APPROVE of contract architecture; one source wording correction below before final approval.
Reviewed normalized blobs: OpenAPI `57b4e2b150f9c21d67d93ae76c1ed4d48dc43ba0`; API_CONTRACT `b4d4ffc21eb573300d078f5518d8cd13600012b0`; ADR-0023 `d5779ece0529deb564a18b1aa499bf2ca2d0bf64`.
Source condition: OpenAPI PATCH description must explicitly reject **every** query parameter with 400. Its current “Neither a query nor the body can nominate...” only bans authority/edit selectors; task and security readiness require zero query parameters.
Contract test/QA should assert that strict no-query rule separately. Generation, fixture/test validation and exact-head CI are separate pending gates, not claimed by this review.
Otherwise architecture aligns with ADR-0016 §3 and ST-081a: seven locked-current ordinary pairs, deterministic target-to-action mapping through the private writer, no self or DETECTED/TRIAL/REJECTED/ARCHIVED transitions.
Strict `{status}` schema rejects mixed/edit/unknown fields; UUID path, owner-only current V1 Bearer, bounded `{id,status}` response, identical missing/invisible 404, RFC 9457 400/401/404/409/masked 500 align with security/product readiness.
ADR-0023 and API_CONTRACT retain broader edit as future roadmap; uncertain retry may return 409 and requires authoritative re-read, with no new audit/replay/retention state or exactly-once claim.
This approves no HTTP route, runtime principal binding, RLS proof, ST-081/UF-06 completion, production or release. Runtime still requires accepted ST-081c and independent exact-head security/DB proof.
