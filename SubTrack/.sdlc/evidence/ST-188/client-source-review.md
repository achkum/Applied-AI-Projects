# ST188 architect-client source review

**Decision: APPROVE**
**Classification: Type 2a contract alignment; no Type 1 decision is introduced.**

## Scope and evidence

Reviewed the ST-188 task, repository instructions, engineering Constitution, supplied `client-plan-review.md`, accepted ADR-0010, and the complete source diff for the five requested contract, generated artifact, test, and ADR files.

The source changes align with the accepted browser security model and the supplied client plan:

- `openapi.yaml` adds the existing `BrowserNonce` parameter to `/v2/auth/session`. The shared `OriginForWeb` and `BrowserNonce` parameters remain `required: false`, with descriptions specifying their web-only requirement; this avoids making them mandatory for mobile at the operation level.
- The strict `WebSessionHeaders` envelope requires `idempotencyKey`, `origin`, and `browserNonce`. `MobileSessionHeaders` remains limited to `idempotencyKey`, and strict envelope schemas reject browser nonce, Origin, and CSRF fields on mobile.
- The session operation describes pairing the public nonce with the distinct HttpOnly binding cookie and exact allowlisted Origin, matching the proof to that browser chain, terminal nonce consumption on successful redemption, and use of session-bound CSRF thereafter. The response schema has no successor nonce.
- Lost one-use web session responses require a fresh verified login and fresh nonce chain; the ADR records generic `AUTH_RESTART_REQUIRED` and no proof or nonce replay. The ADR also identifies terminal consume-only runtime support as a separate gate, preserving the contract-only boundary.
- Generated TypeScript and Zod artifacts reflect the OpenAPI changes. Contract tests cover required web nonce, continued mobile-only idempotency, rejection of mobile nonce/Origin/CSRF, and rejection of `nextBrowserNonce` in the web session response.

No source-level issue requiring changes was found. This review does not claim runtime readiness or attest to generation, lint, typecheck, test, or CI execution; those are owned by the root task agent.

## Exact source hashes

SHA-256 values computed from the reviewed working-tree files:

| File | SHA-256 |
|---|---|
| `packages/contracts/openapi.yaml` | `01c218c048b2467a00211ddb6e5dc2940711585b6b5e9b1088b88b8a8d62ffcd` |
| `packages/contracts/generated/types.gen.ts` | `6b640ed809eecab21b3704ce394526c210f7a2a06da827c53feaf3de8a1f5838` |
| `packages/contracts/generated/zod.gen.ts` | `62dbb5d5f5b9f022e3521b02b13b017af416fa0e5e7e2004300168a82372cf45` |
| `packages/contracts/tests/v2-auth.test.mjs` | `994e742d0d4606eb82da8f01f859434da3d6666969aa765c89faf0c5b82cdc6d` |
| `docs/architecture/adr/ADR-0010.md` | `14a770538d086d11f4976daba0536ab84df0249d4e885de7fd130e20ea899562` |

**Tool call count:** 4 total, including handoff; this is tool invocations, not HTTP requests.
