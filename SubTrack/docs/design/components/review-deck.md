# Review deck

## Purpose
Presents subscription detections for review with visible reasons.

## Anatomy
One detection card; merchant/subscription candidate; amount/cadence; reason constellation check dots; decision controls supplied by consuming flow.

## States
Loading; candidate; reason detail; accepted/rejected/undo only when the host flow supplies these states; empty deck.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
One card at a time on narrow screens; wider layouts may add surrounding whitespace, not additional concurrent decisions.

## Token references
bg.raised, bg.canvas, ink.primary, ink.secondary, line.hairline, ember.amber for a price hike only; category color — CSS `--category-<kebab-code>` (CODE lowercased, `_`→`-`, e.g. `--category-video-streaming`) or native `categoryHue[CODE][theme]` (`categoryHue[CODE]` alone is a `{ light, dark }` object, not a color); generated category hues are subscription categories, not member identity colors; radius.card.

## Interaction
Tinder-style card metaphor from source; this visual contract defines no swipe direction or decision semantics. The consuming flow supplies named actions and action labels. Keep supplied controls operable without gestures; do not infer gestures from action order. See resolved QUESTION/v1.

## Accessibility and reduced motion
Each reason dot has text label; card and controls have logical focus order; do not encode verdict solely by gesture/color; reduced motion removes card travel/rotation.

## Content and localization (sv/en)
Candidate name, formatted amount/cadence, each reason, action labels and empty state in sv/en.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to the generated category tokens (exact CSS kebab-case / native `categoryHue[CODE][theme]` notation in `docs/design/components/README.md`).
