# Member accents for the Scope switcher

`memberAccentForId(opaqueMemberId)` returns a stable `member.accent.01`–`08`
token name. Supply an opaque stable member ID, never a display name or other
personal data. Resolve that token in the active theme; it is independent of
subscription-category hues.

`src/tokens.json` declares the `memberAccent.scopeSwitcherStates` contract,
which is also present in generated `theme.native.json`. Generated `tokens.css`
exposes `--scope-switcher-selected-indicator-stroke-width` and
`--scope-switcher-unselected-indicator-stroke-width`:

| State      | Surface     | Text and indicator ink | Identity mark          | Non-colour cue                                                 |
| ---------- | ----------- | ---------------------- | ---------------------- | -------------------------------------------------------------- |
| Selected   | `bg.raised` | `ink.primary`          | assigned member accent | Visible 2 px checkmark; selected accessibility state is `true` |
| Unselected | `bg.sunken` | `ink.primary`          | assigned member accent | No checkmark; selected accessibility state is `false`          |

The checkmark is a distinct shape, not a colour change. A consuming component
must render it for the selected member and expose its selected state through the
platform accessibility API; this package does not implement that component.
Member names remain text labels, and the accent is a non-text identity mark, not
the sole selected-state signal. `ink.primary` on both surfaces is checked at
4.5:1, and every member accent against both surfaces is checked at 3:1 in both
themes by `scripts/check-contrast.mjs`. These token checks do not replace
component-level interaction and accessibility QA in ST-023.
