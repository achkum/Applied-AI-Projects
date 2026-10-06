# ST-172 JSON Client Review

**Verdict: APPROVE (source review only).** The prior fail-closed finding is resolved in the reviewed source.

## Reviewed source identity

`apps/mobile/src/components/DemoHouseholdScreen.tsx` SHA-256: `46812cee4e85f7b47335c0cec742e97ca0ebd389650fb81b132a3f06d58b011c`

## Re-review of the bounded fix

The screen now requires the supplied subscription array length to equal the canonical fixture length (six), then validates every row's localized display string, merchant label, and original cadence before rendering any amount. The focused tests cover empty and truncated (five-row) fixtures and assert that all merchants and amounts remain hidden; the missing localized label case now runs for both English and Swedish. This resolves the fail-open case from the previous review.

## Other reviewed client boundaries

The screen imports the display fixture through the explicit `@subtrack/i18n/catalogs/demo-fixture` export. It selects only `displayAmount[locale]`; there is no amount parsing, arithmetic, formatter call, direct money/synthetic import, network, auth, storage, or mutation path. The canonical fixture holds the six fictional rows and original cadence values. Localized unavailable copy and locale-specific routes are used. The mobile-path boundary test permits the i18n JSON import and denies money/synthetic imports and re-exports. The mobile manifest uses its existing i18n dependency and has no UI package dependency.

Android and iOS Hermes validation remains deferred to ST-174 per the user's instruction. This approval does not claim native execution passed. Platform/tooling review and QA results remain separately owned.
