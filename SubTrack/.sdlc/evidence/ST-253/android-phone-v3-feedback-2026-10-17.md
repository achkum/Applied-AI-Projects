# Android phone V3 feedback correction

Founder phone screenshots demonstrate a real failed acceptance: profile save shows a generic validation error and blocks progress; selectors only change selection state, not language/theme before profile save; duplicate sandbox Login view and environment badges remain.

Immediate cause reproduced with actual parseProfilePatch: arbitrary emoji input accepts values outside the eight-value avatar enum. Client catch returns invalid before saveNativeProfile, so no save reaches the server for this input. Previous emulator accepted profile left avatar blank and missed this. The screenshot alone does not identify an exact Unicode sequence; the unsupported-emoji regression establishes this validation path without asserting private phone request logs exist.

Profile now offers optional contract-supported avatars, specific name/avatar errors and only name/avatar setup. Language/theme live in existing Manage preferences; patch contains only these selected values and authoritative reread applies them. Actual provider integration test changes translated labels and real dark/light state, persists AsyncStorage and restores state on remount; it ignores deliberately misleading PATCH response and uses GET readback. A new installed flow selects an avatar, saves Swedish/dark, navigates Month/back to force persisted profile reread, then saves English while retaining dark for later accepted screenshots/restarts. Original subscription/backend/revocation assertions remain.

Welcome centres the logo, wordmark and tagline. Sandbox Welcome Log in performs the existing installation resume immediately with duplicate-tap guard and error recovery; production authentication entry is unchanged. Sandbox badges removed from shared pages; package/backend isolation remains.

Local:110 affected component tests PASS; real-provider preferences regression PASS; mobile types/scoped lint/catalog parity PASS; existing flow-policy tests PASS. Installed final source proof and new same-signer V4 remain pending. V3 is not corrected by these source changes. No backend reset, new account, production authentication bypass, iOS/web feature work or automation.
