# ST-050c local browser proof

The development Next rewrite is limited to `/api/v2/auth/:path*` and points to the loopback Nest v2 auth route. The dedicated harness builds production Next, reads the resulting routing manifest, starts Nest with the accepted v2 middleware and no database access, then starts Next dev and runs real Chromium against `http://localhost:3000`.

Run from the repository root:

```sh
corepack pnpm --filter @subtrack/api exec vitest run --config ../../.sdlc/evidence/ST-050c/vitest.config.ts
```

The passing boolean-only receipt is `browser-receipt.json`. It covers browser nonce bootstrap, OTP start and verify, raw Origin and direct loopback peer, automatic secure binding-cookie forwarding, nonce rotation, replay rejection, cookie path isolation, forwarded-header spoof rejection, no-store responses, and the accepted UI's BankID-required state. The test reads the six-digit OTP only from the in-process development sink. It makes no session, BankID, profile, or household calls. The Prisma override throws on data access and the receipt asserts zero access.

Local gates passed: API lint and typecheck, web lint and typecheck, production resolved-config and actual built-manifest checks within the harness, and the dedicated browser test. The harness owns and closes its Nest, Next, and Chromium processes. Ports 3000 and 4000 were free after the run. Next dev regenerated `apps/web/next-env.d.ts` to reference dev types; restore that generated-only change before staging this task.

This is a local development proof. Normal API startup still requires PostgreSQL, and production OTP delivery and signed-in account creation remain pending.
