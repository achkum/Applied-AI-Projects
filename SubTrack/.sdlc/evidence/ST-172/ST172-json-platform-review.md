# ST-172 JSON platform source review

Decision: **APPROVE**.

Reviewed the final JSON-backed mobile demo source against accepted base `32b0dc60dca318429c4f906a2e536d96c5104056` and `/workspace/.setup/ST172-json-architecture.md`.

The mobile screen imports the explicit `@subtrack/i18n/catalogs/demo-fixture` public JSON subpath and does not import money or synthetic runtime APIs. It selects preformatted locale strings, retains original cadence, and now requires the displayed subscription array to match the canonical fixture length before rendering any rows. The focused component tests cover both zero-row and five-row inputs and verify that every amount and merchant is suppressed. The mobile-path boundary case allows that exact i18n entry and denies money/synthetic imports and re-exports; the existing generic cases and web UI fixture allowance remain present.

The i18n export is explicit and adds only the demo fixture subpath. Mobile keeps its existing i18n dependency and has no UI dependency, avoiding the reviewed React 19 peer mismatch. The accepted web UI fixture entry and generated UI artifact, and money/synthetic package source, have no diff from the accepted base. The scoped resolver workarounds have no remaining callers and are removed; Metro and Jest configuration match accepted base, preserving its unrelated settings.

The UI generator builds one canonical DTO, checks `Number.isSafeInteger` before `BigInt`, formats both locales before beginning filesystem writes, then writes the two destinations with per-file temporary-file rename. The ordinary test compares both checked-in artifacts to the same expected DTO. The temporary-directory test verifies unsafe input and a late formatter failure preserve both existing files, and verifies both outputs after a successful generation. This review covers the stated fail-before-write guarantees; it does not claim a transaction across two renames if the filesystem itself fails midway through the write phase.

The mobile source contains no runtime BigInt/Intl formatter or capability probe, as expected after migration. The automated source tests, Expo Web/Metro checks, exact-head CI, and native execution were not run as part of this source-only review. ST-174 remains TODO and explicitly tracks Android and iOS Hermes execution/rendered-state evidence. Native validation is deferred, not passed.

## Exact source SHA-256 values

Hashes below were computed directly from the reviewed checkout with `sha256sum`.

| Path | SHA-256 |
|---|---|
| `apps/mobile/src/components/DemoHouseholdScreen.tsx` | `46812cee4e85f7b47335c0cec742e97ca0ebd389650fb81b132a3f06d58b011c` |
| `apps/mobile/src/components/DemoHouseholdScreen.test.tsx` | `d3827ece8e3f9fd8b9f2fd0aa5a4bad23f866066d0029d3cab01ee028a8d5ec5` |
| `apps/mobile/src/components/WelcomeScreen.tsx` | `62587802686a7623d7b9a4925cb7da79482ae3ef7dcb09e26af27800093cd47c` |
| `apps/mobile/app/(tabs)/en/demo.tsx` | `5142d8261fbe8db02b2e2c27cdea7c122d375336ad081bd315a458a2dd073cb7` |
| `apps/mobile/app/(tabs)/sv/demo.tsx` | `6ec103c62b8b0fc89b0068a82dfc566b790730deb4a6fcdd7b98d1a809d9105d` |
| `apps/mobile/package.json` | `d616bf2283853fc0f1934c796d53c86df6a867b8e2915d9b94440f17f4927363` |
| `apps/mobile/metro.config.js` | `4d4386237e387d2f70f3bdba0f00e4cb603ac8e2141ecaef3406f20ee1037717` |
| `apps/mobile/jest.config.js` | `8745ba1fdb1d4071c586a247ce95a1462c601e36c47027d0483d223122b7d222` |
| `packages/i18n/package.json` | `606ce64ab894f34308691ab4cb28ea40864ffa880ff8c4a4b4181c96c21a754c` |
| `packages/i18n/catalogs/demo-fixture.json` | `6ba2dab2d16cd54aa41c1b2550cdffa8ca19dc34ec2573706e65153b10dfc982` |
| `packages/i18n/catalogs/en.json` | `4ff210781b122460c892d37711e30e5166e4dd9811e3d7d201346aaa690b906e` |
| `packages/i18n/catalogs/sv.json` | `5cc35bbddbbe62f0af4b623414e6e97a5a4827d796d0236d2d29ea0653bd1de1` |
| `packages/ui/scripts/generate-demo-fixture.ts` | `f665e5a1d882b805376c94f660b44af59742247107048d7dcec8b38e743c715c` |
| `packages/ui/src/demo-fixture.test.ts` | `c00496e929d55f26d39f4680ec0bc2a15b93011e0070daa709c17bf4965f13e9` |
| `packages/config/test/boundaries.test.mjs` | `18f5a3d97ea2f7224b64a3d6e4cf33345bba9e1ebc57c5db1d3162a06ee1530b` |

Review scope: final source inspection only. No source, Git state, package installation, network, test, build, or native-device changes were made by this reviewer. Five shell calls were used across the initial and incremental review; an earlier read-only diff command included an invalid abbreviated ref before the full accepted base was used. The incremental call inspected the six-row guard and zero/five-row tests, recomputed the screen/test hashes, and rebound these values here. Task metadata hashes are omitted because status/completion fields may change before commit.
