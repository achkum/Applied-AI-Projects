# ST-238 C4 parallel generation isolation handoff

The repeat-generation assertion in `packages/contracts/tests/contracts.test.mjs` now creates a fresh temporary directory inside the contracts package for each canonical configuration. A temporary wrapper imports the unchanged production or fixture config and overrides only `output` with an absolute path inside that directory. The generator still runs from the contracts package, with the canonical input, plugins, and Zod resolver. Both runs, the nonempty TypeScript artifact assertion, and the relative-path SHA-256 artifact comparison remain. The test removes only its own verified temporary directory in `finally`; it no longer cleans or writes `packages/contracts/generated` or `packages/contracts/fixtures/generated`.

Validation in this worktree:

- `node --test --test-concurrency=1 packages/contracts/tests/contracts.test.mjs`: 3/3 passed.
- `corepack pnpm --filter @subtrack/contracts test` launched concurrently with `corepack pnpm --filter @subtrack/web exec vitest run test/registration-flow.test.tsx`: all 27 Node contract tests passed and the focused web suite passed 6/6. Their runs overlapped while the isolated generator test was executing. The package command's subsequent nested `pnpm test:zod-fixture` did not launch because this local PowerShell environment has Corepack but no bare `pnpm` executable on PATH.
- `corepack pnpm --filter @subtrack/contracts generate:fixture` and the package script's `node --experimental-strip-types` Zod probe were run directly afterward; both passed.

No contract configuration, generator CLI, runtime generated bindings, Turbo settings, package scripts, or test assertions outside the one stability test changed. Fresh parallel CI and independent source review remain required before acceptance. No commit or push was made by this author.
