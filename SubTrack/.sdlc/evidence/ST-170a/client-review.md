# ST170a Architect-Client Final Review

**Decision: APPROVE**

The additive v2 wire contract and generated client artifacts resolve the previous client-review findings. This approval covers contract and validation artifacts only. ST170b remains required before proof production is client-ready; generated wire models do not establish runtime or future adapter readiness.

- **Uncertain credential responses:** Session creation specifies generic `409 AUTH_RESTART_REQUIRED` without returning credentials. Clients discard local credentials and complete a fresh server-verified login; owner-scoped session listing/revocation can address a known prior `sessionId`, while an unknown orphan expires normally. Refresh explicitly forbids retrying the old credential because consumed-token reuse revokes its family; clients discard credentials and reauthenticate before managing a known old session.
- **Browser and mobile transport:** The contract models web/mobile transport separately and documents required web Origin/nonce/CSRF context. Generated operation-level Origin remains optional where an operation supports both transports; the documented generated wire-call envelopes carry transport and required fields together for future adapters. The addendum correctly says low-level SDK calls do not enforce those envelopes, and browsers supply Origin automatically (JavaScript must not set it).
- **Strict input validation:** `additionalProperties: false` is translated to `.strict()` by `packages/contracts/openapi-ts.config.mjs`; generated Zod objects use `.strict()`, preserving separate legacy schemas.
- **Nonce caching:** Browser nonce bootstrap now specifies `Cache-Control: no-store`; `docs/product/API_CONTRACT.md` also requires `Pragma: no-cache`.

The task acceptance criteria retain deterministic generation, meaningful contract/schema boundary tests, lint/typecheck, and exact-head CI as QA requirements owned by the root agent. This review does not claim those checks passed. Runtime endpoints, deployment, migration, provider integration, and client adapters remain outside this approval.

## Final source-freeze recheck (Conductor transcription)
Independent reviewer reaffirmed APPROVE: flattened closed web/mobile OTP bodies use constant transport, required web origin/nonce headers, mobile exclusion and direct strict session refs. Generated validators and meaningful tests reviewed; no new wire fields. Supplied QA8tests+fixture pass; reviewer did not run checks. Tool cap left artifact append to Conductor.
