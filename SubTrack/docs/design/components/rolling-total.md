# Rolling total

## Purpose
Hero recurring-cost amount for the currently selected scope, with monthly/annual view toggle.

## Anatomy
Large Fraunces tabular amount; currency; period label; monthly/annual toggle.

## States
Loading; amount available; zero/empty; stale/unavailable; monthly selected; annual selected. No example amount is prescribed.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
Hero number follows responsive type scale and wraps only as a complete locale-formatted amount; toggle remains adjacent and operable.

## Token references
ink.primary, ink.secondary, bg.canvas, aurora.violet (active Me accent per source context), typography.fontFamily.display, typography.fontVariantNumeric (tabular-nums), typography.fontSize.hero, motion.spring.

## Interaction
Scope changes roll digits; period toggle flips between monthly and annual total; reduced motion swaps value without digit animation.

## Accessibility and reduced motion
Expose full formatted amount and period as one coherent accessible value; tabular figures; locale-aware formatting from sv-SE/en-SE; integer minor-unit source only, no UI arithmetic.

## Content and localization (sv/en)
Formatted currency and period label; Monthly / Månadsvis; Annual / Årsvis; loading and unavailable announcements.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.
