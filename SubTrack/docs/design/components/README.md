# Norrsken signature component specifications

Implementable visual contracts for the complete ST-023 set. Each spec covers purpose, anatomy, states, responsive behavior, token references, interaction, accessibility/reduced motion, and sv/en content.

- [Orbit](orbit.md)
- [Receipt card](receipt-card.md)
- [Scope switcher](scope-switcher.md)
- [Rolling total](rolling-total.md)
- [Review deck](review-deck.md)
- [Settlement ribbon](settlement-ribbon.md)
- [Insight tiles](insight-tiles.md)

Open decisions: [QUESTION/v1 records](QUESTIONS.md). Token source: `packages/ui-tokens/src/tokens.json`, `src/categories.json`, `src/member-accent.mjs`, and the generated outputs in `packages/ui-tokens/generated/`.

### Category tokens
CSS emits one custom property per category CODE, normalized to kebab-case: lowercase the CODE and replace each `_` with `-` (e.g. `VIDEO_STREAMING` → `--category-video-streaming`), scoped under `:root, [data-theme='light']` and `[data-theme='dark']`. Native reads `categoryHue[CODE]`, which is a `{ light, dark }` object, not a color; select the active color with `categoryHue[CODE][theme]` (e.g. `categoryHue.VIDEO_STREAMING.dark`). Never shorten this to `--category-<code>` / `categoryHue[CODE]` as if either directly yields a paintable color.

### Member identity accent tokens
Delivered by ST-030. Source slots `member.accent.01`…`member.accent.08` in `src/tokens.json`, each a `{ light, dark }` pair. CSS emits `--member-accent-01`…`--member-accent-08`, scoped the same way as category tokens. Native reads `theme.native.json`'s `memberAccent.slots['member.accent.0N'][theme]`. Resolve which slot applies to a given member with `memberAccentForId(opaqueMemberId)` from `@subtrack/ui-tokens/member-accent` (stable `fnv1a-32` hash over the opaque member ID, per `memberAccent.selection`); never pass display names or other personal data into it. `memberAccent.scopeSwitcherStates.selected`/`.unselected` define the surface, foreground, selection indicator, and `accessibilitySelected` flag for each state; `identityMark: "member.accent"` means render the member's resolved slot color there. Member accent tokens are a separate palette from category hues and must never be substituted for one another.

Product direction: `docs/product/DESIGN_DIRECTION.md` §§3–7.
