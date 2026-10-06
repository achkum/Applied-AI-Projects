# ST-173 import-boundary decision

Date: 2026-10-06
Scope: architecture recommendation for ST-173 web demo readiness; this note makes no source, lint, test, dependency, or Git changes.

## Decision

Keep the shared client import boundary intact. Implement an explicit public presentation entry through the already-client-approved `@subtrack/ui` package for the fictional demo's display data, with that entry internally using the public `@subtrack/synthetic` persona and `@subtrack/money` exact minor-unit formatter. The web route may consume only the UI presentation entry and render its returned display DTO. The entry must expose only demo presentation data/behavior; it must not expose bank providers, persistence, arithmetic helpers, or broad package re-exports. Keep the safe-integer check before `BigInt` and fail closed without a numeric amount.

This is the smallest option that satisfies the feature's public-API intent while preserving the existing shared client policy as a meaningful package boundary. It avoids turning broad access to either `@subtrack/money` or `@subtrack/synthetic` into a general client capability. `@subtrack/ui` is already explicitly client-approved and already owns shared presentation. A direct alias exception cannot reliably constrain an import to selected export names with the current `no-restricted-imports` package-pattern rule; permitting either package alias would effectively authorize every export at that root.

Before implementation, revise ST-173's contract and `allowed_paths` to include the narrowly owned UI facade and its contract/boundary tests, and add `architect-platform` review for the presentation boundary. This scope adjustment is required because current allowed paths do not authorize modifying `packages/ui` or shared lint policy. Keep source fixture and money APIs unchanged. Do not route imports through a private source path or resolver alias.

## Authority and conflict

The Constitution is highest priority. It requires deterministic integer-minor-unit money to be handled in `packages/money`, applies its source-priority ordering, and says conflicts must be escalated rather than silently selected. Accepted ADR-0009 establishes the client-approved shared `packages/ui` placement and names `packages/money` as the shared formatter. ST-173 then expressly requires the public synthetic persona and public exact formatter at the feature boundary. The shared ESLint policy is an implementation guard, not a higher-priority architecture decision: it currently blocks those direct client imports, so neither ignoring the lint failure nor describing the feature as policy-conformant is appropriate. The facade aligns the task's public API intent with the accepted client package boundary; the task contract must be updated to match that implementation.

## Evidence observed

- `packages/config/eslint.config.mjs` allows web imports from `config`, `contracts`, `i18n`, `ui`, and `ui-tokens`; its `no-restricted-imports` regex denies every other `@subtrack/*` root, including `money` and `synthetic`.
- `packages/config/test/boundaries.test.mjs` asserts that both web and mobile reject `money` and `synthetic` aliases, as well as future private aliases. A policy change must preserve those assertions for all non-approved imports and include negative tests for accidental broad access.
- No `apps/web/eslint.config.mjs` exists. `apps/mobile/eslint.config.mjs` spreads the shared config, so its green local/CI status does not establish conformance for source paths outside the shared config's effective lint set; do not cite green mobile CI as permission to relax the shared policy.
- Current demo source imports `formatMinorUnits`/`assertSafeMinorUnits` from `@subtrack/money` and `PERSONA_LINDQVIST` from `@subtrack/synthetic`. Its route test also imports both roots. These are actual violations of the current client alias rule, regardless of CI outcome.
- An existing `@subtrack/ui` public package root is explicitly permitted by the shared policy. A presentation entry can be exposed through that approved root without adding a new package or changing package resolution.
- Shared ESLint ignores cover `node_modules`, `dist`, `_legacy`, `docs`, and `.sdlc`, but not generated Next `.next` output. `.next` is already Git-ignored. A separate narrow `**/.next/**` ignore is appropriate for generated files; it must not ignore `apps/web/app`, `test`, or any source path.

## Guardrails and validation expectations

The UI facade should return an explicit display DTO (merchant, original cadence, currency, and already localized exact amount or unavailable state), not a `PersonaHousehold` passthrough or generic synthetic-package proxy. Its focused tests should verify the six fictional entries, amount safety/failure behavior, and exact formatting. Boundary tests should prove clients can import the facade through `@subtrack/ui` while direct imports/re-exports of `@subtrack/money`, `@subtrack/synthetic`, and other denied aliases continue to fail. Preserve current broad negative cases and add checks around the actual demo entry. Any `.next` lint ignore must be path-limited to generated output.

CI green under a config glob that misses a file is execution evidence only; it does not override the shared boundary policy or establish architecture conformance. Report policy conformance only after the applicable lint path and negative boundary tests exercise the real source arrangement.

## Update after observed production build failure

The production build trace (`/workspace/.setup/ST173-web-build.txt`) changes the implementation recommendation. Do not use a runtime `@subtrack/ui` TypeScript facade that imports public money and synthetic package roots: it would retain those imports in Turbopack's graph and reproduce the observed failure. Turbopack follows the roots into `packages/money/src/index.ts` and `packages/synthetic/src/index.ts`, then fails to resolve internal `.js` specifiers such as `./formatter.js`, `./personas.js`, and `./bank-provider.js` to TypeScript source. The trace records 8 module-resolution errors and a failed production build.

Use a source-owned generated JSON display DTO exposed as a dedicated public subpath of the already-approved UI package:

- `packages/ui/scripts/generate-demo-fixture.ts`: generation-only tool in a TS-aware package tooling context. Import only the public `@subtrack/synthetic` and `@subtrack/money` roots. Convert each fixture number only after `Number.isSafeInteger`, then call `formatMinorUnits(BigInt(amountMinor), currency, { locale })` for `en` and `sv`. Abort on unsafe input or formatter error and never write a partial artifact.
- `packages/ui/src/generated/demo-fixture.json`: checked-in generated DTO, with the six fixture rows in source order, stable ID/merchant, original cadence enum, currency, original amount as a decimal string for audit, and exact `en`/`sv` formatted strings. No totals, projections, normalized cadences, or approximate values.
- `packages/ui/package.json`: explicitly export `./demo-fixture` to that JSON file. The web route imports only `@subtrack/ui/demo-fixture`, selects the locale's exact string, and performs no amount conversion or formatting. This is a static JSON subpath and must not load `packages/ui/src/index.ts` or money/synthetic module graphs in the Next build.
- `packages/ui/test/demo-fixture.spec.ts` or an equivalent focused test: derive expected output again from the public fixture and formatter, then deep-compare the checked-in JSON. Verify six rows, original cadence/currency/amount correspondence, both locales, and unsafe-input/formatter-error failure. CI fails if the artifact is stale. Provide an explicit deterministic generation command; write via temporary file and rename only after all rows/locales succeed.

Keep the existing client allowlist unchanged; its approved `ui/` pattern permits this public subpath. Do not add private aliases or broaden access to either package root. Generation and verification stay in UI tooling outside the Next runtime graph.

Revise ST-173 `allowed_paths` to include the UI manifest, generator, generated DTO, focused test, and package scripts, and add `architect-platform` review. Update the route contract to consume the UI-owned exact display DTO; canonical formatting and fixture conversion are enforced during generation and verification. Preserve all six rows, exact values, safety checks, bilingual presentation, fictional disclosure, and no-total criteria. Remove current direct web money/synthetic imports before readiness.

Acceptance criterion 5 must report the production web build separately and mark it failed until a run after this subpath change passes. This trace establishes the concrete current failure; the JSON subpath is a recommended remedy, not proof of a fix. If the actual Next build still fails, keep ST-173 blocked and report resolver evidence. Do not compensate with broad aliases or disabled guards.
