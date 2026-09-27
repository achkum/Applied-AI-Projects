# Orbit

## Purpose
Home overview of subscription cadence, relative monthly cost and ownership scopes.

## Anatomy
A labelled orbital field; subscription bodies; concentric Me / Shared / member rings; optional selected-body detail; accessible list alternative.

## States
Loading; populated; no subscriptions (line-art constellation); selected; many bodies; reduced motion; unavailable category hue falls back to OTHER_SUBSCRIPTION token.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
Canvas/SVG scales within hero container; preserve body hit targets and ring labels; narrow layouts use list alternative rather than shrinking labels below readable size.

## Token references
bg.canvas, bg.raised, ink.primary, ink.secondary, line.hairline; `--category-<category-code>` (CSS) / `categoryHue[<CATEGORY_CODE>]` (native); generated category hues are subscription categories, not member identity colors; motion.orbitRevolutionSeconds; typography sizes.

## Interaction
Tap body opens subscription detail; long-press presents quick split affordance only when the subscription is shared; list alternative exposes equivalent subscription selection.

## Accessibility and reduced motion
Expose each body as named list item with category, subscription name, locale-formatted recurring cost/cadence, and scope; never rely on hue or position alone. Reduced motion disables rotation and defaults to list.

## Content and localization (sv/en)
Subscription name, category label, recurring cost, cadence, scope/member name; “View as list” / “Visa som lista”; selected state and quick-split action labels.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.
