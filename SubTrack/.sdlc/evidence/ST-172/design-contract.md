# ST-172 design review contract

This review applies to the localized Expo mobile demo household screen in `.sdlc/tasks/ST-172.md`. The route is an illustrative, client-bundled read-only demo. The UI must say plainly in both locales that the household and its data are fictional; it must not imply a server session, tenant boundary, account, or successful sign-in. Keep the demo launcher distinct from Create account and Log in, and provide a direct, obvious return to Welcome. No fabricated destinations are needed for account actions.

## Screen hierarchy and content

- Establish the SubTrack/Norrsken identity, then a prominent demo/fictional-data notice, then the household identity, then the subscription list. The screen should feel editorial and calm, with strong hierarchy and clear scannability.
- Render all six original fixture subscriptions as individual entries. Each entry pairs the fictional merchant label with its original exact formatted amount and original Monthly or Annual cadence. Keep cadence adjacent to the amount so the time basis is unmistakable. Do not show a mixed-cadence household total, monthly equivalent, ranking by computed spend, or other derived money figure.
- Keep the content read-only. The only controls needed are the demo entry and return actions; any optional local selection must be clearly non-persistent and must not look like data editing.
- At 320 logical units, entries should reflow and wrap without horizontal scrolling, clipped currency, or cadence detached from its price. At 375 units, use the available width without making the list feel sparse or turning each row into a large, repetitive card grid. Validate both widths with English and Swedish copy.

## Visual and accessibility constraints

- Use the existing native theme/token system for canvas, raised surfaces, primary/secondary ink, dividers, typography, and radii. Respect both light (Snö) and dark (Polarnatt) themes; no hard-coded color literals or one-theme-only treatment. The Norrsken direction is editorial meets celestial: restrained aurora accent, Fraunces where available for display/numerals, Manrope for UI, tabular numerals for prices. Avoid introducing decorative motion or an Orbit visualization that competes with this simple list.
- All actionable controls, including demo launch and return, need at least 44×44 logical-unit hit areas and visible focus/pressed feedback. Use native button/link semantics, accessible names, and sensible screen-reader order. Communicate fictional status and cadence in text, never by color alone.
- Maintain legible text and control contrast in both themes; do not place body copy over an aurora gradient. Support text scaling by allowing labels and prices to wrap. Keep primary body text at a comfortable UI size (16 logical units where practical); secondary copy must remain readable and pass the repository's token contrast contract.
- Localize all user-facing text and formatting for English and Swedish. Ensure Swedish labels fit, avoid truncation, and retain the price/cadence relationship when line-wrapped.

## Review evidence and gates

Final design approval requires the stable source revision and actual Expo Web screenshots at 320 and 375 logical units for both locales and both themes (8 states total), plus evidence that controls remain accessible and that all six rows are present. Review the actual screenshots against these constraints; do not infer visual correctness from source or a browser-only view. The demo must be explicitly fictional and read-only on every localized route.

Expo Web/Metro screenshots and tests do not establish native runtime support. Native Hermes execution of the exact-money capability gate and rendered screen remains a separate required pre-merge gate under ST-172; no browser-native equivalence claim is accepted.
