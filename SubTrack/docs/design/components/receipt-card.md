# Receipt card

## Purpose
Editorial subscription-detail header that makes current recurring price and price history legible.

## Anatomy
Merchant/subscription heading; category marker; current price in Fraunces; billing cadence; thin price-history ticker; perforated lower edge.

## States
Loading; populated; no history (omit ticker, do not invent points); price increase highlighted with ember.amber; price decrease/steady uses semantic text, not new color; unavailable amount.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
Full-width card in mobile; desktop detail column; ticker retains a textual summary/list equivalent at every width.

## Token references
bg.raised, bg.canvas, ink.primary, ink.secondary, line.hairline, ember.amber; `--category-<category-code>` (CSS) / `categoryHue[<CATEGORY_CODE>]` (native); generated category hues are subscription categories, not member identity colors; typography.fontFamily.display/ui; radius.card.

## Interaction
Static header; ticker data points may be inspected via accessible adjacent history summary. No behavior inferred beyond source.

## Accessibility and reduced motion
Semantic heading and labelled amount; ticker has text alternative; contrast-safe labels; no color-only price-change indication; respect reduced motion (no animated ticker).

## Content and localization (sv/en)
Subscription/merchant name, category, formatted price, cadence, date/price history labels, increase summary.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.
