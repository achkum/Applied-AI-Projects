# Resolved design questions — ST-023

Both choices below preserve the accepted concept in `docs/product/DESIGN_DIRECTION.md` §§3–7.

```yaml
contract: QUESTION/v1
task_id: ST-023
question: "What token source supplies distinct member accent colors in the Scope switcher? The accepted token set defines semantic colors and 22 subscription-category hues, but no member palette; category hues must not be repurposed as identity colors."
options:
  - "A: Use one existing semantic accent for all member scopes; simplest, but members are not color-distinguished."
  - "B: Define a member palette in a separate design-system task; requires token/design scope beyond ST-023."
  - "C: Do not tint the screen by member; revise the stated visual behavior in a design-direction decision."
decision_class: DESIGN
resolution: "B — Add a separate UI-token task defining distinct, theme-aware member accent tokens, with contrast validation and web/native mappings. Category tokens remain reserved for subscription categories."
status: "Resolved. ST-030 (DONE, merged to subtrack/develop) delivered `memberAccent.slots['member.accent.01'…'08']` with contrast-validated light/dark values, `memberAccentForId()` selection, and generated CSS/native mappings. Scope switcher spec now references the real token names."
```

```yaml
contract: QUESTION/v1
task_id: ST-023
question: "Which actions and decision labels does the Review deck present for a detection, and what is the non-gesture equivalent? The source specifies a Tinder-style card metaphor and visible reasons, but not decision semantics or swipe mapping."
options:
  - "A: Keep ST-023 visual-only; host flow supplies named actions and buttons, with gesture mapping deferred to the consuming feature spec."
  - "B: Specify explicit review actions and gesture mapping in a separate product/flow decision."
decision_class: DESIGN
resolution: "A — This is a visual component contract. The consuming flow owns its actions and labels; controls it supplies must be operable without gestures. ST-023 defines no swipe direction or decision semantics."
status: "Resolved."
```
