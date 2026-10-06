# ST-051b design review: bundled font startup

**Verdict: Approve the scoped font-startup slice for design review.** The reviewed implementation and supplied browser proof support the claim that the bundled font path works in Expo Web across the documented locale and theme states. This is not approval of the overall onboarding screen, native-device appearance, or the unfinished parent ST-051.

## Evidence reviewed

- `.setup/ST051b-browser-proof/receipt.json` identifies the run as the actual Expo React Native Web app in Chromium 151, records explicit `sv`/`en` and `light`/`dark` states, reports both `Manrope` and `Fraunces` loaded in each of the four states, and reports no browser errors.
- Inspected all four 375 × 812 captures (`sv-light.png`, `sv-dark.png`, `en-light.png`, `en-dark.png`). The Fraunces wordmark remains legible and consistent; locale labels and theme controls remain readable in both palettes. Switching locale and theme does not visibly disturb layout in these captures.
- SHA-256 comparisons show the mobile Manrope and Fraunces TTFs and both OFL text files exactly match the accepted copies under `apps/web/public/fonts` (the font files at its root and licenses under `licenses/`).
- `apps/mobile/app/_layout.tsx` holds the app behind the splash while font loading is pending, starts the app on successful load or error, and catches splash prevent/hide promise failures. Font errors select platform system families and pass the fallback choice through `RootProvider` into `ThemeProvider`; generated token data and stored theme preference are not modified.
- Focused tests cover pending then loaded startup, successful startup, font-error startup with system aliases, splash-hide rejection, provider forwarding, unchanged token data, and preference preservation. These are useful logic checks for this slice.

## Design notes and limits

The welcome screen is explicitly placeholder content. Its explanatory paragraph uses the mono token, so its serif-like appearance is expected and does not indicate a Manrope loading failure. The four captures include the Expo development `Refreshing…` footer; that is development chrome, not product UI. Neither is a blocker for this font-only slice.

This evidence demonstrates web font loading and visual rendering in the captured browser states. It does not establish iOS or Android device appearance, native splash behavior, screen-reader/accessibility quality, or the final onboarding design. The task itself leaves those device checks outside its bundle/Jest claims, and the parent ST-051 remains incomplete. The browser receipt and screenshots also do not replace the task's separate mobile lint/typecheck and offline Android/iOS asset-bundle checks or the required exact-head CI gate; those results must be assessed independently before merge.

Reviewed files: `.sdlc/tasks/ST-051b.md`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/providers/RootProvider.tsx`, `apps/mobile/src/context/ThemeContext.tsx`, `apps/mobile/src/providers/RootLayout.test.tsx`, `apps/mobile/src/context/ThemeContext.test.tsx`, `apps/mobile/src/components/WelcomeScreen.tsx`, plus the receipt and four captures named above.
