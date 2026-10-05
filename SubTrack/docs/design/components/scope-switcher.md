# Scope switcher

## Purpose
Selects personal, household, or member scope and communicates the active scope accent.

## Anatomy
Segmented pill; Me segment; Household segment; member avatar segments; accessible selected state.

## States
Me active (aurora.violet); Household active (aurora.green); member active — resolved via `memberAccentForId(opaqueMemberId)` from `@subtrack/ui-tokens/member-accent`, returns one of `member.accent.01`–`member.accent.08`; focus; disabled/loading only if host provides that state.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs. All `member.accent.NN` tokens are validated at ≥ 3:1 against both `bg.raised` and `bg.sunken` in light and dark themes (ST-030).

## Responsive behavior
Horizontal scroll when segments do not fit; preserve selected segment visibility and accessible names; do not collapse member choices silently.

## Token references
bg.raised, bg.sunken, ink.primary, ink.secondary, line.hairline, aurora.violet (Me), aurora.green (Household); member identity accent tokens `member.accent.01`–`member.accent.08` (resolved by ST-030) via `memberAccentForId(opaqueMemberId)`; radius.pill. Pass the stable opaque member UUID — do not pass display names, email, or other PII.

## Interaction
Selecting a segment changes the screen scope/accent; state is conveyed by selected semantics in addition to color. Each member's accent is resolved by calling `memberAccentForId(member.id)` where `member.id` is the stable opaque UUID — the same ID always maps to the same accent across renders and themes. Selected state uses a visible 2 px ring/checkmark and `accessibilityState: { selected: true }` in addition to the accent color, so the distinction is never color-only.

## Accessibility and reduced motion
Keyboard-operable segmented control; name each member; selected state exposed; avatar has text label; no color-only distinction. Reduced motion uses immediate accent update.

Selected controls use a raised surface with primary ink, a separate scope identity-accent ring, and the generated 2 px primary-ink checkmark. Unselected controls use the sunken surface and primary ink without a checkmark. Member avatars use the raised surface and primary ink with their stable member-accent ring. A separate primary-ink focus outline distinguishes keyboard focus from selected state; the focused option is scrolled into view with immediate nearest-edge scrolling. Under reduced motion, the selected-state transition is disabled so the accent update is immediate.

## Content and localization (sv/en)
Me / Jag; Household / Hushåll; member display name; selected-scope accessibility announcement.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.
