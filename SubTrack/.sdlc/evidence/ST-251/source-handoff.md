# ST-251 native subscription discovery handoff

Scope: existing personal subscription screen, complete owner-list search, category groups and expected active subtotals. Reuses the accepted Billing Month native design. No backend endpoint, authentication model, integration, web source or live APK change.

Owner reads exhaust the cursor under the existing session token and abort signal. Every sandbox page retains MANUAL/SEK/alwaysPrivate checks. Duplicate IDs/cursor cycles and stale or aborted work fail closed. Mutations retain durable API writes followed by complete readback. Search uses displayed names and localized category labels; category groups retain inactive rows and existing row actions. Expected totals describe matching ACTIVE rows only, separated by currency and saved cadence using shared BigInt Money. They do not claim paid charges, currency conversion, normalized spending or a snapshot across concurrent page reads.

Validated so far: focused helper tests (8 initial tests), Swedish/English catalog parity, SDK54 Android and iOS Metro/Hermes export including bundled production fonts. Initial mounted screen checks caught a redundant presentation decoder rejecting injected legacy-category fallback rows; bounded correction and final tests/review remain pending. Actual transport remains category-enum strict. Export preceded the correction and is provisional until final source qualification.

Current tester APK remains version2 at https://198.44.116.159/download. Backend TLS, restart/readback, isolation, refresh/logout and hosted signed bytes are qualified. Physical Android installation/result and iPhone signing access remain pending. Source tests/export do not satisfy installed acceptance. No release, spending or real integration delivery.

## Final source validation

- Mounted NativePersonalScreen: 30/30 tests pass after measured fallback repair (9.526 seconds).
- List projection/pagination helper: 9/9 tests pass, 100% statements/branches/functions/lines coverage.
- Mobile typecheck and changed six TypeScript-file ESLint pass.
- Swedish/English nested keys, value shapes and ICU placeholders match.
- Final SDK54 sandbox Android/iOS Hermes export passes, 39 assets including bundled native fonts. Local version3 export is preparation only; no APK signing or live update is claimed.
- Independent consolidated client/security/Money review: final SOURCE GO; initial HOLD for fallback incompatibility resolved by preserving original presentation rows while keeping transport validation unchanged.
- git diff --check passes.

Installed native testing and applicable remote CI remain separate gates. No native completion percentage or production readiness claim.

## Save-failure lifecycle correction

Installed Android/iOS Add failure exposed erased feedback: phase-dependent focus cleanup ran when real session rejection changed phase. The focus callback now stays stable and uses current phase/load/cleanup refs; actual blur/unmount retains owner-state clearing, abort and stale-result fences. Regression exercises failed create through real NativeSessionProvider with effect-backed focus lifecycle, asserting unavailable/re-verification and cleared private draft.31 screen tests, scoped lint and mobile types PASS. Independent client/security SOURCE GO matched screen SHA 3a26782b8cb7ea4137ee602985de5f74d1f7df62c929c2847624352fd25504d6 and test SHA 1bee2155d99a22db7c966d5e2a2992e4a7806cbe37ed3b7a5df52cbc2164b863. Existing blur/stale completion regression retained. Underlying create failure is still unproven; no installed acceptance or deployment claim.
