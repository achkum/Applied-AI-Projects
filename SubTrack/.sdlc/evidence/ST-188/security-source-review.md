# ST-188 security/privacy source review

**Decision: APPROVE — contract alignment with the accepted browser session security model.**

The session operation reuses the existing optional-at-operation-level `BrowserNonce` header parameter; the web wire envelope requires the nonce while the mobile envelope remains idempotency-only. The session contract binds the nonce to the distinct HttpOnly cookie, exact allowlisted Origin, and trusted same-chain login proof; it specifies terminal nonce consumption without a successor and the separate session-bound CSRF token after login. Lost committed responses require generic `AUTH_RESTART_REQUIRED` and a fresh verified login/nonce chain. Mobile rejects browser fields, v1 remains unchanged, and the web response schema rejects `nextBrowserNonce`.

ADR-0010 explicitly limits ST-188 to contract alignment and states that the current runtime nonce core lacks consume-only behavior. It requires a separate runtime task and review and rejects rotate-and-discard as equivalent. Thus these source changes make no runtime-readiness claim.

I found no security/privacy issue requiring changes in the reviewed five-file diff. This is an independent source review; it does not attest to generation, lint, typecheck, tests, or CI.

Reviewed source SHA-256:
- `packages/contracts/openapi.yaml`: `01c218c048b2467a00211ddb6e5dc2940711585b6b5e9b1088b88b8a8d62ffcd`
- `packages/contracts/generated/types.gen.ts`: `6b640ed809eecab21b3704ce394526c210f7a2a06da827c53feaf3de8a1f5838`
- `packages/contracts/generated/zod.gen.ts`: `62dbb5d5f5b9f022e3521b02b13b017af416fa0e5e7e2004300168a82372cf45`
- `packages/contracts/tests/v2-auth.test.mjs`: `994e742d0d4606eb82da8f01f859434da3d6666969aa765c89faf0c5b82cdc6d`
- `docs/architecture/adr/ADR-0010.md`: `14a770538d086d11f4976daba0536ab84df0249d4e885de7fd130e20ea899562`

**Actual tool-call count: 4** (three source-reading exec calls and this artifact-write exec call; no Git or metadata operation).
