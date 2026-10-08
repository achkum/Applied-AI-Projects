# ST-183 platform source review

**Decision: APPROVE**

The resolver source and its focused spec satisfy the ST-183 platform contract reviewed here. Authorization verifies only through the injected v2 verifier, validates the strict transport and claims snapshots before reading, and makes one owner-scoped session read using a frozen `{ userId: claims.sub }` context. It snapshots and validates the returned session, checks identity/session/transport and web origin/chain binding, then rechecks the clock after awaiting the reader. Clock rollback, token or session expiry, malformed snapshots, collaborator failures, and other failures normalize to `Unauthorized`. The success value is a frozen minimal principal copy.

The spec covers the real simulator proof → issuer → token → resolver paths for web and mobile, single scoped reads, owner deletion after issuance, web scope mismatch, hostile snapshots and uncalled getters, captured method receivers, invalid credentials, corrupt records, deferred token/session expiry and clock rollback, and independence of the returned principal. These checks are source-reviewed only here; I did not run QA.

**Limitations:** This approval is limited to the platform source contract for the two reviewed files. It does not establish durable or distributed consistency beyond the session reader's current-owner read contract, production wiring, HTTP integration, or full-task completion. I did not run tests, lint, typecheck, build, inspect Git state, or review security approval/CI evidence. The parent reports QA passed; that result is not independently verified by this review.

**SHA256**

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-principal-resolver.ts`: `99e346dcdb21d77006196021a86848d9d31c2eb2f475a057b293777668de90a3`

`/workspace/Applied-AI-Projects/SubTrack/apps/api/src/auth/sessions-v2/v2-principal-resolver.spec.ts`: `fa0f54ad7a6d8206e280b48b706a6f063862fce50d4ff838b2c0c1c47c93564b`

Actual shell/tool call count: 4 (batched source read, spec read, SHA256, artifact write).
