# ST-058b design review

**Result: APPROVE.** Source and browser review show the web Home preserves the approved composition and styling: the desktop two-column grid, mobile single-column order and breakpoint, title scale, spacing, canvas/ink tokens, and 44rem Orbit cap match the accepted Storybook screen. The local Storybook font-face declarations were omitted as required; the web layout supplies the same Fraunces and Manrope families through its existing font setup.

The only intentional content extension is a second disclosure paragraph for privacy transparency. It uses the existing disclosure grid area and wraps within the same 38ch measure. The Swedish and English screenshots show the page remains balanced in both light and dark themes, with clear contrast and no clipping or overlap. Both font families render in every state.

The fixture and behavior also match the approved scope: three visible subscriptions in Me, five in Household, correct monthly totals, localized controls, and the household access/sharing disclosure. Root browser checks confirmed exact totals and projection values, native pointer and keyboard selection, hidden-selection restoration, reduced-motion behavior, and the 375px layout, with no browser errors.

Reviewed source: `home-screen.tsx`, `home-screen.module.css`, `home-mock.ts`, `page.tsx`; approved `HomeScreen.tsx` and `HomeScreen.module.css`; `Orbit.stories.tsx` presentation helper; locale disclosure strings; web locale layout/font setup; public Orbit behavior/CSS. Reviewed visual evidence: `/workspace/.setup/ST058b-browser-proof/{sv-light,sv-dark,en-light,en-dark}.png` and `report.json`. No repository source was modified for this review.
