# Scope switcher

## Purpose
Selects personal, household, or member scope and communicates the active scope accent.

## Anatomy
Segmented pill; Me segment; Household segment; member avatar segments; accessible selected state.

## States
Me active (aurora.violet); Household active (aurora.green); member active — resolve the member's slot with `memberAccentForId(opaqueMemberId)` (`@subtrack/ui-tokens/member-accent`) and render `memberAccent.slots[<slot>][theme]`; focus; disabled/loading only if host provides that state.

Each member segment follows `memberAccent.scopeSwitcherStates`:
- **selected**: surface `bg.raised`, foreground `ink.primary`, identity mark = the resolved member-accent slot color, checkmark selection indicator (2px stroke), `accessibilitySelected: true`.
- **unselected**: surface `bg.sunken`, foreground `ink.primary`, identity mark = the resolved member-accent slot color, no selection indicator, `accessibilitySelected: false`.

Both states resolve the same member-accent slot in the active theme (`light`/`dark`) — only the surface, indicator, and `accessibilitySelected` flag change between selected and unselected.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
Horizontal scroll when segments do not fit; preserve selected segment visibility and accessible names; do not collapse member choices silently.

## Token references
bg.raised, bg.sunken, ink.primary, ink.secondary, line.hairline, aurora.violet (Me), aurora.green (Household); `memberAccent.slots['member.accent.01'…'member.accent.08']` resolved via `memberAccentForId(opaqueMemberId)` — CSS `--member-accent-01`…`--member-accent-08`, native `memberAccent.slots[<slot>][theme]`; radius.pill. Category hue tokens (`--category-<code>` / `categoryHue[CODE][theme]`) must not be used here — member identity and subscription category are separate palettes.

## Interaction
Selecting a segment changes the screen scope/accent; state is conveyed by selected semantics in addition to color. Each member's segment uses its `memberAccentForId`-resolved slot as its identity mark in both selected and unselected states; never fabricate or substitute a tint, and never reuse a category hue.

## Accessibility and reduced motion
Keyboard-operable segmented control; name each member; selected state exposed; avatar has text label; no color-only distinction. Reduced motion uses immediate accent update.

## Content and localization (sv/en)
Me / Jag; Household / Hushåll; member display name; selected-scope accessibility announcement.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to the generated category tokens (exact CSS kebab-case / native `categoryHue[CODE][theme]` notation in `docs/design/components/README.md`).
