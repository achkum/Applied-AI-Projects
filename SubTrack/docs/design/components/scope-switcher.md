# Scope switcher

## Purpose
Selects personal, household, or member scope and communicates the active scope accent.

## Anatomy
Segmented pill; Me segment; Household segment; member avatar segments; accessible selected state.

## States
Me active (aurora.violet); Household active (aurora.green); member active (accent source unresolved; see QUESTION/v1); focus; disabled/loading only if host provides that state.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
Horizontal scroll when segments do not fit; preserve selected segment visibility and accessible names; do not collapse member choices silently.

## Token references
bg.raised, bg.sunken, ink.primary, ink.secondary, line.hairline, aurora.violet (Me), aurora.green (Household); member accent is unresolved (see QUESTION/v1); radius.pill.

## Interaction
Selecting a segment changes the screen scope/accent; state is conveyed by selected semantics in addition to color.

## Accessibility and reduced motion
Keyboard-operable segmented control; name each member; selected state exposed; avatar has text label; no color-only distinction. Reduced motion uses immediate accent update.

## Content and localization (sv/en)
Me / Jag; Household / Hushåll; member display name; selected-scope accessibility announcement.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.
