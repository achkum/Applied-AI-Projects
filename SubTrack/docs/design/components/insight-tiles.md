# Insight tiles

## Purpose
Magazine-style pull quotes for subscription insights and recap text.

## Anatomy
Pull-quote paragraph; editorial drop cap for LLM recap; optional source/category label when provided by host.

## States
Loading; populated; empty; long text; unavailable; insight with numeric claim.

## Themes
Resolve named semantic roles against both `light` and `dark` themes; never hard-code color values. Verify text/foreground combinations against the declared contrast pairs.

## Responsive behavior
Grid/list uses content order; long copy wraps without clipping; desktop columns may vary but do not reorder reading sequence.

## Token references
bg.raised, bg.canvas, ink.primary, ink.secondary, line.hairline, typography.fontFamily.display/ui, radius.card; `--category-<category-code>` (CSS) / `categoryHue[<CATEGORY_CODE>]` (native); generated category hues are subscription categories, not member identity colors only for an explicitly present category.

## Interaction
Reading surface; no click affordance unless host adds an explicit action. No invented chart/score.

## Accessibility and reduced motion
Semantic quote/paragraph; drop cap is decorative; full text remains available to assistive technology; reduced motion avoids entrance animation. Numeric claims must match supplied data and locale formatting; no recalculation in presentation.

## Content and localization (sv/en)
Insight copy, optional category/source, dates and numeric amounts, empty/loading status in sv/en; generated narrative must be localized upstream.

## Implementation boundary
This is a visual component contract, not a product/API contract. Consume supplied domain data and host actions; do not derive unsupported product behavior, invent sample values, or add ad-hoc colors. Use `packages/i18n/catalogs/sv.json` and `en.json` keys in parity for visible copy. Amount presentation follows locale (`sv-SE` / `en-SE`) and the shared money formatter; category appearance maps only to generated `packages/ui-tokens` category tokens.
