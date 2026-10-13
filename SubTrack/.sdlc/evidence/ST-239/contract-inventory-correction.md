# ST-239 contract inventory correction

Recorded 2026-10-11 19:16 UTC within original source 1 window (18:18:06.654–22:18:06.654 UTC). Bounded contract author correction only; no commit, stage, or push.

## Exact change

`packages/contracts/tests/contracts.test.mjs`: added the one missing expected unavailable-default row, `POST /v2/auth/login/simulator/verify`, immediately after the enrollment simulator verify row. The OpenAPI operation already declares `x-runtime-availability: unavailable-default`. No other expected route, implementation, schema, or generated file was edited by this correction.

`git diff --numstat` for the contract test: **1 insertion, 0 deletions**. `git diff --check` passed. SHA-256 of the corrected test file: `8C158AA0A0B072ACEDD8DABF33C27B21F7AFFA0A16B68EB55201A08157B811C8`.

```diff
       ['POST /v2/auth/enrollment/simulator/verify', 'unavailable-default'],
+      ['POST /v2/auth/login/simulator/verify', 'unavailable-default'],
       ['POST /v2/me/mode', 'unavailable-default'],
```

## Verification

- `node --test --test-concurrency=1 ./tests/contracts.test.mjs`: **3 passed, 0 failed** (including production and fixture repeat-generation stability, validator, and exact route inventory).
- `corepack pnpm test:zod-fixture`: the script failed at its nested `pnpm generate:fixture` because `pnpm` is not on the Windows child-process PATH. This is an invocation environment issue, not a fixture assertion failure.
- Ran the script's two constituent commands directly: `node ./node_modules/@hey-api/openapi-ts/bin/run.js -f ./openapi-ts.fixture.config.mjs --no-log-file` and `node --experimental-strip-types --input-type=module -e "import { zProbeOnly } from './fixtures/generated/zod.gen.ts'; if (!zProbeOnly.safeParse({ probeId: 'fixture' }).success) process.exit(1);"`. **Both exited 0**.
- Scoped status after fixture generation showed only the one modified contract test; no fixture-generated diff.

Full suite and downstream gates remain with Conductor.
