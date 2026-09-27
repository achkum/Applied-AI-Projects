# Open design questions — ST-023

These are explicitly unresolved in DESIGN_DIRECTION.md and must be answered before downstream implementation freezes them. Until resolved, ST-023 remains BACKLOG per AC3. No answer below is assumed.

```yaml
contract: QUESTION/v1
task_id: ST-023
question: "What token source supplies distinct member accent colors in the Scope switcher? The accepted token set defines semantic colors and 22 subscription-category hues, but no member palette; category hues must not be repurposed as identity colors."
options:
  - "A: Use one existing semantic accent for all member scopes; simplest, but members are not color-distinguished."
  - "B: Define a member palette in a separate design-system task; requires token/design scope beyond ST-023."
  - "C: Do not tint the screen by member; revise the stated visual behavior in a design-direction decision."
decision_class: DESIGN
```

```yaml
contract: QUESTION/v1
task_id: ST-023
question: "Which actions and decision labels does the Review deck present for a detection, and what is the non-gesture equivalent? The source specifies a Tinder-style card metaphor and visible reasons, but not decision semantics or swipe mapping."
options:
  - "A: Keep ST-023 visual-only; host flow supplies named actions and buttons, with gesture mapping deferred to the consuming feature spec."
  - "B: Specify explicit review actions and gesture mapping in a separate product/flow decision."
decision_class: DESIGN
```
