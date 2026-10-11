# ST-238 C1 money formatter entry build correction handoff

Source candidate only, 2026-10-11 17:11 UTC. This continues the original L240 attempt 1/source attempt 1 clock from 2026-10-11T16:41:13.258Z to 20:41:13.258Z. C1 remains FAILED/HOLD until fresh exact-head actual proof and independent review.

The C1 private run 38158246036 stopped at Next production build: six unresolved `.js` imports came through `packages/money/src/index.ts`; its first bounded compiler diagnostic was `./converted-cost.js`. The pure `packages/money/src/formatter.ts` has no imports. `packages/money/package.json` now publishes an explicit `./formatter` subpath with `types` and `import` both pointing to that existing source file. The UI public facade now re-exports its existing `formatMinorUnits` binding from `@subtrack/money/formatter`. The web client still imports only the approved UI facade. No money arithmetic, money source index, client boundary/config rule, auth behavior, provider, or feature behavior was changed. Existing UI public-entry test already covers the large bigint locale display, zero-decimal currency, and rejected invalid input, so no test source change was needed.

Local validation at this working tree:

- `corepack pnpm --filter @subtrack/ui exec vitest run src/money-display.test.ts`: PASS, 2/2 tests.
- `corepack pnpm --filter @subtrack/web exec vitest run test/private-subscriptions.test.tsx`: PASS, 3/3 tests.
- `corepack pnpm --filter @subtrack/ui typecheck` and `corepack pnpm --filter @subtrack/web typecheck`: PASS.
- `corepack pnpm --filter @subtrack/ui lint` and `corepack pnpm --filter @subtrack/web lint`: PASS.
- `corepack pnpm --filter @subtrack/web build`: exit 0. Next.js 16.3.6 Turbopack compiled successfully in 5.2s, finished TypeScript in 4.4s, generated all 11 static pages, and emitted the `/[locale]/subscriptions/[id]` dynamic route. The only build warning was the existing deprecated middleware file convention.

This local build establishes the entry-resolution correction only. It does not establish the C1 private browser or owned PG16 proof. Independent platform/security source review is required before the Conductor's next push and exact-head C2 run. No commit or self-approval was made by this author.
