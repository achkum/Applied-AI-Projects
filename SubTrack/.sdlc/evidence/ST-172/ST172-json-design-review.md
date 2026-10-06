# ST172 mobile JSON demo design review

**Decision: APPROVE — current Expo Web source and visual presentation.**

I inspected all eight current browser captures: English and Swedish, light and dark themes, at 320 and 375 CSS pixels. The fictional-demo banner is prominent, the Lindqvist household description is clear, and all six subscriptions retain their localized SEK display amount and original monthly or annual cadence. Both themes have readable text and distinct raised/sunken surfaces. At both widths, long Swedish cadence labels wrap without clipping or horizontal overflow. The return control remains visible and comfortably exceeds the 44-unit minimum. The captures show the same established layout and theme treatment as the accepted draft.

The QA report records no browser errors, API requests, or overflow in the eight responsive/theme scenarios. Its two injected BigInt/Intl-unavailable cases retain all original display prices with zero BigInt Intl calls; this matches the migrated React-free JSON display path. The visible “Refreshing… / Don’t see your changes? Reload the app” strip at the bottom of the captures is Expo Web’s development refresh UI, not application content.

The unavailable-state copy is truthful: it says demo display data is unavailable and that amounts are hidden. I found no design change required for this JSON migration.

Native Android and iOS execution and visual evidence remain **deferred by the user to ST174**. This review does not claim native validation passed. This approval covers the source and Expo Web presentation for the bounded read-only demo only; it makes no claim about server isolation, authentication, or rate limiting.

## Reviewed source hashes

Computed with `sha256sum` from the reviewed checkout:

- `apps/mobile/src/components/DemoHouseholdScreen.tsx`: `46812cee4e85f7b47335c0cec742e97ca0ebd389650fb81b132a3f06d58b011c`
- `apps/mobile/src/components/WelcomeScreen.tsx`: `62587802686a7623d7b9a4925cb7da79482ae3ef7dcb09e26af27800093cd47c`
- `packages/i18n/catalogs/en.json`: `4ff210781b122460c892d37711e30e5166e4dd9811e3d7d201346aaa690b906e`
- `packages/i18n/catalogs/sv.json`: `5cc35bbddbbe62f0af4b623414e6e97a5a4827d796d0236d2d29ea0653bd1de1`

Evidence reviewed: `/workspace/.setup/ST172-json-browser-qa.json` and all eight `/workspace/.setup/ST172-json-{en,sv}-{light,dark}-{320,375}.png` captures.

## Final capture refresh receipt

After Expo Web had time to clear its transient refresh strip, I re-inspected the refreshed `ST172-json-en-light-320.png` and `ST172-json-sv-dark-320.png` captures. Both are clean and exclude the development-only bottom strip; the app layout and rows show no change. This confirms the final 10-scenario capture refresh and leaves the original design approval unchanged.
