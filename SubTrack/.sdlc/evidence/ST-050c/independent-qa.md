# ST-050c independent QA run

Independent QA ran the dedicated harness from the repository root on the current mainline base:

```sh
corepack pnpm --filter @subtrack/api exec vitest run --config ../../.sdlc/evidence/ST-050c/vitest.config.ts
```

Result: 1 test passed in 11.80 seconds. The generated `browser-receipt.json` contains 25 checks, all `true`. The run exercised the actual Next dev proxy, Nest loopback API, and Chromium browser; production build and route-manifest checks are included in the harness. Vitest output contained only sanitized request method/status/timing logs and the test name, with no OTP, nonce, proof, identifier, cookie, or challenge values.

After completion, ports 3000 and 4000 had no listening processes. The harness closed browser and server processes. Next regenerated `apps/web/next-env.d.ts`; this generated file is outside the task's allowed paths and should be restored before staging.