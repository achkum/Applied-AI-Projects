# ST-188 independent platform source review

**Decision: APPROVE.** Reviewed the exact requested source set against `.sdlc/tasks/ST-188.md`, `AGENTS.md`, `docs/governance/CONSTITUTION.md`, and `.sdlc/evidence/ST-188/platform-plan-review.md`.

The session endpoint references the existing `BrowserNonce` parameter, while that parameter remains `required: false` globally and its description limits the requirement to web transport. The strict `WebSessionHeaders` object requires `browserNonce`, and its generated Zod counterpart is strict and requires the value. This correctly models transport-conditional HTTP headers alongside a required web envelope.

The contract preserves the exact allowlisted Origin and distinct HttpOnly binding-cookie chain, requires the login proof to match that same trusted chain, and specifies terminal nonce consumption on successful redemption with no successor. The web response remains session-bound CSRF; tests reject a `nextBrowserNonce` response field. Mobile session headers remain idempotency-only, with tests rejecting nonce, Origin, and CSRF on mobile. The diff does not modify v1 paths or schemas, and the contract test retains explicit v1 baseline assertions.

ADR-0010 clarifies the accepted browser-chain behavior and explicitly identifies ST-188 as contract-only. It states that the current nonce core lacks terminal consume-only behavior and requires a separate runtime task/review, without claiming runtime readiness. I found no source-level blocker in the requested scope. This is a source review only; it does not attest to generation, lint, typecheck, or tests.

**Exact SHA-256 source hashes**

- `packages/contracts/openapi.yaml`: `01c218c048b2467a00211ddb6e5dc2940711585b6b5e9b1088b88b8a8d62ffcd`
- `packages/contracts/generated/types.gen.ts`: `6b640ed809eecab21b3704ce394526c210f7a2a06da827c53feaf3de8a1f5838`
- `packages/contracts/generated/zod.gen.ts`: `62dbb5d5f5b9f022e3521b02b13b017af416fa0e5e7e2004300168a82372cf45`
- `packages/contracts/tests/v2-auth.test.mjs`: `994e742d0d4606eb82da8f01f859434da3d6666969aa765c89faf0c5b82cdc6d`
- `docs/architecture/adr/ADR-0010.md`: `14a770538d086d11f4976daba0536ab84df0249d4e885de7fd130e20ea899562`

Tool calls used: 3 (two batched source reads/inspection calls; one artifact write).
