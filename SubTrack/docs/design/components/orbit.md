# Orbit

## Purpose
Home overview of subscription cadence, relative monthly cost and ownership scopes.

## Anatomy
A labelled orbital field; subscription bodies; concentric Me / Shared / member scope bands; selected-body detail affordance; accessible list alternative. Each body has a visual diameter independent of its interactive hit target.

## States
Loading; populated; no subscriptions (line-art constellation); selected; many bodies; reduced motion; unavailable category hue falls back to OTHER_SUBSCRIPTION token.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs. Visible body-name abbreviations use `ink.primary` glyphs on a `bg.raised` outline painted behind the glyphs, retaining the category-colored bodies. The current 3px stroke is a repair candidate pending renewed pixel validation: the prior 2px candidate failed one dark-theme hover pixel for Peloton at (733,246), where the rendered pixel remained category-colored. Verify the actual adjacent label surface in rendered pixels across themes, selected and hover states; a declared stroke alone does not prove contrast. This treatment does not change the known SVG geometry, font size or hit-target limits.

## Responsive behavior
Canvas/SVG scales within hero container; preserve a 44 × 44 CSS-pixel / platform-point minimum hit target around each body and readable ring labels. If scope bands cannot fit without overlapping hit targets, default to the list rather than changing the cost/cadence mapping. Never infer a different cost from viewport size.

## Token references
bg.canvas, bg.raised, ink.primary, ink.secondary, line.hairline; `--category-<category-code>` (CSS) / `categoryHue[<CATEGORY_CODE>]` (native); generated category hues are subscription categories, not member identity colors; motion.orbitRevolutionSeconds, motion.spring; typography.fontSize. Diameter and lane percentages below are geometry rules, not new color or typography tokens.

## Cost and cadence geometry
- **Body diameter → monthly cost:** The host supplies each visible subscription's non-negative *monthly-equivalent* cost in integer minor units, computed by the shared money/domain layer. The money layer compares those exact costs within the displayed scope and supplies a visual-only `costRatio` from 0 to 1: zero when the maximum is zero, otherwise the item's monthly cost divided by the maximum, converted to a display scalar only after exact minor-unit handling. Orbit never divides, rounds, or converts currency. Set `diameter = 24 + 32 × sqrt(costRatio)` CSS pixels / platform points. Thus zero cost uses 24 and the largest cost uses 56; higher monthly cost can never produce a smaller body. Use a separate minimum 44 hit target. Recompute the ratio on scope/data change and keep the accessible formatted amount exact; diameter is only a relative cue, never a substitute for the amount.
- **Orbit radius → billing cadence:** Each Me / Shared / member scope band has an inner and outer usable radius after reserving labels, hit targets, and adjacent bands. Within that band, place monthly cadence at its inner edge and annual cadence at its outer edge. For a host-supplied positive, calendar-aware cadence expressed as months between bills (`cadenceMonths`), interpolate with `position = clamp(log(cadenceMonths) / log(12), 0, 1)` and `radius = inner + (outer - inner) × position`. Consequently quarterly and semiannual cadence sit between monthly and annual in that order; shorter-than-monthly and longer-than-annual cadence clamp to the respective edge. If cadence is absent or cannot be normalized, do not guess a radius: show the item in the list with its supplied cadence label. Scope band remains the ownership cue; radius *within* a band is the cadence cue. When bodies would collide, vary angle or use the list—never swap radial order to solve layout.

## Interaction
Tap body opens subscription detail; long-press presents a quick split affordance; list alternative exposes equivalent subscription selection and the same host-supplied quick-split action. Selecting a body uses its stable subscription ID as the shared-element key: the selected body comes forward from its current on-screen bounds, preserves its category color, and expands into the subscription detail header while the remaining Orbit recedes. Use the existing `motion.spring` values; on back navigation the body returns to its current Orbit bounds, or fades into the list if it is no longer visible. Do not animate a body into a different subscription after reordering.

## Accessibility and reduced motion
Expose each body as a named, keyboard-operable item with category, subscription name, exact locale-formatted recurring cost/cadence, and scope; never rely on hue, diameter, or position alone. Provide a persistent “View as list” control; the list exposes the same subscriptions, detail action, and host-supplied quick-split action, not a decorative fallback. Reduced motion disables rotation and shared-element travel, defaults to the list, and opens detail without motion. On selection, move focus to the detail heading; on return, restore focus to the originating body/list item (or the list heading if it disappeared). Announce selection/detail changes once, not on every animation frame.

## Content and localization (sv/en)
Subscription name, category label, recurring cost, cadence, scope/member name; “View as list” / “Visa som lista”; selected state and quick-split action labels.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.

## Additive semantic-list presentation input
The web component may receive an optional locale and a presentation record keyed by each displayed stable subscription ID. Every record supplies a nonblank localized `categoryLabel`, exact host-formatted monthly-equivalent `amountLabel`, `cadenceLabel`, and `ownerLabel`. Orbit displays these values unchanged and does not format/convert money, multiply annual costs, translate enum values, or derive member names. If the optional map is omitted, existing callers keep the legacy component output and interaction; this compatibility path is not claimed to satisfy the enriched semantic-list behavior. If the map is supplied, locale and a complete nonblank record for every displayed ID are required; invalid supplied input fails before rendering rather than silently falling back. Extra map entries are ignored. In enriched mode the semantic list is the only keyboard/AT subscription-selection interface; the SVG is hidden from the accessibility tree and remains a pointer enhancement using the same stable-ID selection callback. The persistent list-mode control exposes its selected state, and reduced motion starts in list mode without rotation. This input does not change geometry, SVG target size, collision policy, cadence/ownership mapping, or quick-split behavior.
