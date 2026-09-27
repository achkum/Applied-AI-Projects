# Settlement ribbon

## Purpose
Shows a settlement amount traveling along a line between two household avatars.

## Anatomy
Payer avatar; recipient avatar; connecting line; locale-formatted amount; settled status when supplied by host.

## States
Pending; settled; unavailable amount; reduced motion.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
Line and avatars adapt to available width; textual payer→recipient summary remains available if ribbon is condensed.

## Token references
bg.canvas, bg.raised, ink.primary, ink.secondary, aurora.green (settled/shared semantic), line.hairline, typography.display/ui, motion.spring.

## Interaction
Animate amount along line; haptic on settled payment only where platform supports it and host reports settled.

## Accessibility and reduced motion
Accessible sentence names payer, recipient, amount and status; do not rely on direction/color; reduced motion renders static line and amount.

## Content and localization (sv/en)
Payer/recipient names, formatted settlement amount, pending/settled status.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.
